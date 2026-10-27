import Link from "next/link";
import { ArrowLeft, Check, Minus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AppShell } from "@/components/layout/app-shell";
import { requireOrgAccess, canManageOrg } from "@/lib/data/org-access";
import { getCurrentUser } from "@/lib/data/current-user";
import { getOrgPlanLimits, getOrganizationMemberCount } from "@/lib/limits";
import { getOrganizationStorageUsage } from "@/lib/storage/storage";
import { hasDirectDatabase } from "@/lib/db/pool";
import { createServiceClient } from "@/lib/supabase-server";
import { isBillingConfigured } from "@/lib/billing/stripe";
import {
  BILLING_INTERVALS,
  TRIAL_PERIOD_DAYS,
  canStartTrial,
  isBillingInterval,
  yearlySavingsPercent,
  type BillingInterval,
} from "@/lib/billing/billing-core";
import { cn } from "@/lib/utils";
import { UpgradeButton, ManageBillingButton } from "./billing-actions";
import { PromoCodeCard } from "./promo-code-card";
import { PaymentIssueBanner } from "@/components/billing/payment-issue-banner";

interface PlanPriceRow {
  plan_id: string;
  billing_interval: BillingInterval;
  amount_cents: number;
}

interface PlanRow {
  id: string;
  name: string;
  /** null means custom/"contact us" pricing (034_enterprise_plan.sql). */
  price_cents: number | null;
  project_limit: number | null;
  task_limit_per_project: number | null;
  /** Absent until migration 049 has run. */
  member_limit_per_project?: number | null;
  storage_limit_bytes: number | null;
  /** Seats (049). Absent until that migration runs - `select("*")` just won't have it. */
  member_limit?: number | null;
  has_ai_features: boolean;
  has_github_integration: boolean;
  has_advanced_analytics: boolean;
  has_team_roles: boolean;
  has_audit_logs: boolean;
  has_priority_support: boolean;
  /** Set once an operator creates this plan's Price in the Stripe Dashboard - see docs/configuration.md. */
  stripe_price_id: string | null;
}

type BillingTranslator = Awaited<ReturnType<typeof getTranslations>>;

function formatBytes(bytes: number | null, t: BillingTranslator): string {
  if (bytes === null) return t("unlimited");
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(0)} GB`;
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

function formatCount(value: number | null, t: BillingTranslator): string {
  return value === null ? t("unlimited") : value.toLocaleString();
}

function formatPrice(cents: number | null, interval: BillingInterval, t: BillingTranslator): string {
  if (cents === null) return t("contactUs");
  return cents === 0 ? t("free") : `€${(cents / 100).toFixed(2)}${t("perInterval", { interval })}`;
}

export default async function BillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ checkout?: string; plan?: string; interval?: string }>;
}) {
  const { id: orgId } = await params;
  // `plan` comes from /upgrade (e.g. a pricing-section link) and only
  // highlights that row - nothing is bought until the user clicks Upgrade.
  const { checkout, plan: requestedPlanId, interval: requestedInterval } = await searchParams;
  const interval: BillingInterval = isBillingInterval(requestedInterval) ? requestedInterval : "month";
  const t = await getTranslations("organizations.billing");
  const [access, user] = await Promise.all([requireOrgAccess(orgId), getCurrentUser()]);
  const canManageBilling = canManageOrg(access.role) && isBillingConfigured();

  if (hasDirectDatabase()) {
    return (
      <AppShell user={user}>
        <div className="container mx-auto max-w-7xl px-6 py-8">
          <div className="flex items-center gap-4 mb-8">
            <Button variant="ghost" size="icon" asChild>
              <Link href={`/organizations/${orgId}`} aria-label={t("backToOrganization")}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <h1 className="text-3xl font-bold">{t("title")}</h1>
          </div>
          <Card>
            <CardContent className="py-6 text-muted-foreground">
              {t("selfHostedNotice")}
            </CardContent>
          </Card>
        </div>
      </AppShell>
    );
  }

  const supabase = createServiceClient();

  const [{ data: plansData }, { data: pricesData }, { data: subscriptionData }, projectCount, planLimits, storageUsage, memberCount] = await Promise.all([
    supabase.from("plans").select("*").order("sort_order"),
    // Absent before migration 071 - the query then errors and only the
    // monthly plans.price_cents is shown, as before.
    supabase.from("plan_prices").select("plan_id, billing_interval, amount_cents").eq("active", true),
    // "*": trial_used_at/past_due_since (071) are absent before that migration.
    supabase.from("subscriptions").select("*").eq("organization_id", orgId).maybeSingle(),
    supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId),
    getOrgPlanLimits(orgId),
    getOrganizationStorageUsage(orgId),
    getOrganizationMemberCount(orgId).catch(() => null),
  ]);

  const plans = (plansData ?? []) as PlanRow[];
  const prices = (pricesData ?? []) as PlanPriceRow[];
  const subscription = (subscriptionData ?? null) as {
    plan_id: string;
    status: string;
    stripe_customer_id?: string | null;
    trial_used_at?: string | null;
  } | null;
  const trialAvailable = canStartTrial(subscription?.trial_used_at);
  const priceFor = (plan: PlanRow, wanted: BillingInterval) =>
    prices.find((price) => price.plan_id === plan.id && price.billing_interval === wanted) ?? null;
  // The monthly price from before plan_prices (071) still counts.
  const amountFor = (plan: PlanRow, wanted: BillingInterval): number | null | undefined => {
    if (plan.price_cents === null || plan.price_cents === 0) return plan.price_cents;
    const price = priceFor(plan, wanted);
    if (price) return price.amount_cents;
    return wanted === "month" ? plan.price_cents : undefined;
  };
  const purchasable = (plan: PlanRow) =>
    Boolean(priceFor(plan, interval)) || (interval === "month" && Boolean(plan.stripe_price_id));
  // Only intervals some plan is actually sold at get a tab.
  const intervals = BILLING_INTERVALS.filter(
    (value) => value === "month" || prices.some((price) => price.billing_interval === value)
  );
  const yearlySaving = Math.max(
    0,
    ...plans.map((plan) => yearlySavingsPercent(amountFor(plan, "month") ?? 0, amountFor(plan, "year") ?? 0))
  );
  const currentProjectCount = projectCount.count ?? 0;
  const currentPlanId = subscription?.plan_id ?? "free";
  // "Manage billing" (Stripe Customer Portal - can upgrade/downgrade/cancel
  // there too) replaces per-plan Upgrade buttons once there's an active paid
  // subscription to manage; Free/canceled orgs get per-plan Upgrade buttons
  // (a fresh Checkout Session) instead, since there's nothing for the Portal
  // to manage yet.
  // past_due counts too: the Portal is where a failed card gets replaced.
  const hasActivePaidSubscription =
    currentPlanId !== "free" &&
    (subscription?.status === "active" || subscription?.status === "trialing" || subscription?.status === "past_due");

  const usageRows = [
    { label: t("projectsLabel"), used: currentProjectCount, limit: planLimits.projectLimit, format: (v: number | null) => formatCount(v, t) },
    { label: t("storageLabel"), used: storageUsage, limit: planLimits.storageLimitBytes, format: (v: number | null) => formatBytes(v, t) },
    ...(memberCount === null
      ? []
      : [{ label: t("membersLabel"), used: memberCount, limit: planLimits.memberLimit, format: (v: number | null) => formatCount(v, t) }]),
  ];
  const showSeats = plans.some((plan) => plan.member_limit !== undefined);

  return (
    <AppShell user={user}>
      <div className="container mx-auto max-w-7xl px-6 py-8">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link href={`/organizations/${orgId}`} aria-label={t("backToOrganization")}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-3xl font-bold">{t("title")}</h1>
              <p className="text-muted-foreground">
                {planLimits.promoUntil
                  ? t("currentPlanPromo", { plan: planLimits.planName, date: new Date(planLimits.promoUntil) })
                  : t("currentPlan", { plan: planLimits.planName })}
              </p>
            </div>
          </div>
          {canManageBilling && hasActivePaidSubscription && (
            <ManageBillingButton organizationId={orgId} label={t("manageBilling")} />
          )}
        </div>

        {canManageOrg(access.role) && !isBillingConfigured() && (
          <Card className="mb-6 border-dashed">
            <CardContent className="py-4 text-sm text-muted-foreground" role="note">{t("paidSoon")}</CardContent>
          </Card>
        )}

        <PaymentIssueBanner
          payment={planLimits.payment}
          className="mb-6"
          action={canManageBilling ? <ManageBillingButton organizationId={orgId} label={t("updatePayment")} /> : null}
        />

        {checkout === "success" && (
          <Card className="mb-6 border-success/30 bg-success/5">
            <CardContent className="py-4 text-success">{t("checkoutSuccess")}</CardContent>
          </Card>
        )}
        {checkout === "cancelled" && (
          <Card className="mb-6">
            <CardContent className="py-4 text-muted-foreground">{t("checkoutCancelled")}</CardContent>
          </Card>
        )}

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{t("usageTitle")}</CardTitle>
            <CardDescription>{t("usageDescription", { plan: planLimits.planName })}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {usageRows.map((row) => {
              const percent = row.limit ? Math.min(100, (row.used / row.limit) * 100) : 0;
              return (
                <div key={row.label} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>{row.label}</span>
                    <span className="text-muted-foreground">
                      {row.format(row.used)} / {row.format(row.limit)}
                    </span>
                  </div>
                  {row.limit !== null && <Progress value={percent} />}
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Not tied to Stripe being configured: a promo code grants a plan
            without any payment (migration 062). */}
        {canManageOrg(access.role) && (
          <PromoCodeCard organizationId={orgId} planNames={Object.fromEntries(plans.map((plan) => [plan.id, plan.name]))} />
        )}

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4 space-y-0">
            <div className="space-y-1.5">
              <CardTitle>{t("plansTitle")}</CardTitle>
              <CardDescription>{t("plansDescription")}</CardDescription>
            </div>
            {intervals.length > 1 && (
              <nav aria-label={t("billingPeriod")} className="flex rounded-lg border border-border p-0.5 text-sm">
                {intervals.map((value) => (
                  <Link
                    key={value}
                    href={`/organizations/${orgId}/billing?interval=${value}`}
                    scroll={false}
                    aria-current={value === interval ? "page" : undefined}
                    className={cn(
                      "rounded-md px-3 py-1 transition-colors",
                      value === interval ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {t("interval", { interval: value })}
                    {value === "year" && yearlySaving > 0 && (
                      <span className="ml-1.5 text-xs opacity-80">{t("yearlySaving", { percent: yearlySaving })}</span>
                    )}
                  </Link>
                ))}
              </nav>
            )}
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground [&>th]:px-4 [&>th]:py-2 [&>th]:font-medium">
                  <th>{t("colPlan")}</th>
                  <th>{t("colPrice")}</th>
                  <th>{t("colProjects")}</th>
                  {showSeats && <th>{t("colMembers")}</th>}
                  <th>{t("colTasksPerProject")}</th>
                  <th>{t("colMembersPerProject")}</th>
                  <th>{t("colStorage")}</th>
                  <th>{t("colAI")}</th>
                  <th>{t("colGitHub")}</th>
                  <th>{t("colTeamRoles")}</th>
                  <th>{t("colAuditLogs")}</th>
                  {canManageBilling && <th />}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {plans.map((plan) => {
                  const isCurrent = plan.id === currentPlanId;
                  const isRequested = !isCurrent && plan.id === requestedPlanId;
                  return (
                    <tr
                      key={plan.id}
                      className={`[&>td]:px-4 [&>td]:py-3 ${isCurrent ? "bg-primary/5" : ""} ${isRequested ? "bg-primary/10 outline outline-2 -outline-offset-2 outline-primary" : ""}`}
                    >
                      <td className="font-medium">{plan.name}</td>
                      <td>
                        {(() => {
                          const amount = amountFor(plan, interval);
                          return amount === undefined ? "—" : formatPrice(amount, interval, t);
                        })()}
                        {trialAvailable && plan.price_cents !== null && plan.price_cents > 0 && !isCurrent && purchasable(plan) && (
                          <div className="text-xs text-muted-foreground">{t("trialNotice", { days: TRIAL_PERIOD_DAYS })}</div>
                        )}
                      </td>
                      <td>{formatCount(plan.project_limit, t)}</td>
                      {showSeats && <td>{formatCount(plan.member_limit ?? null, t)}</td>}
                      <td>{formatCount(plan.task_limit_per_project, t)}</td>
                      <td>{plan.member_limit_per_project === undefined ? "—" : formatCount(plan.member_limit_per_project, t)}</td>
                      <td>{formatBytes(plan.storage_limit_bytes, t)}</td>
                      <td>{plan.has_ai_features ? <Check className="h-4 w-4 text-success" /> : <Minus className="h-4 w-4 text-muted-foreground" />}</td>
                      <td>{plan.has_github_integration ? <Check className="h-4 w-4 text-success" /> : <Minus className="h-4 w-4 text-muted-foreground" />}</td>
                      <td>{plan.has_team_roles ? <Check className="h-4 w-4 text-success" /> : <Minus className="h-4 w-4 text-muted-foreground" />}</td>
                      <td>{plan.has_audit_logs ? <Check className="h-4 w-4 text-success" /> : <Minus className="h-4 w-4 text-muted-foreground" />}</td>
                      {canManageBilling && (
                        <td>
                          {isCurrent ? (
                            <span className="text-xs text-muted-foreground">{t("currentPlanBadge")}</span>
                          ) : (
                            !hasActivePaidSubscription &&
                            purchasable(plan) && (
                              <UpgradeButton organizationId={orgId} planId={plan.id} interval={interval} label={t("upgrade")} />
                            )
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
