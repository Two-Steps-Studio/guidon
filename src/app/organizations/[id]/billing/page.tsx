import Link from "next/link";
import { ArrowLeft, Check, Minus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AppShell } from "@/components/layout/app-shell";
import { requireOrgAccess, canManageOrg } from "@/lib/data/org-access";
import { getCurrentUser } from "@/lib/data/current-user";
import { getOrgPlanLimits } from "@/lib/limits";
import { getOrganizationStorageUsage } from "@/lib/storage/storage";
import { hasDirectDatabase } from "@/lib/db/pool";
import { createServiceClient } from "@/lib/supabase-server";
import { isBillingConfigured } from "@/lib/billing/stripe";
import { UpgradeButton, ManageBillingButton } from "./billing-actions";

/** Matches src/app/organizations/[id]/billing/actions.ts's TRIAL_PERIOD_DAYS. */
const TRIAL_PERIOD_DAYS = 14;

interface PlanRow {
  id: string;
  name: string;
  /** null means custom/"contact us" pricing (034_enterprise_plan.sql). */
  price_cents: number | null;
  project_limit: number | null;
  task_limit_per_project: number | null;
  storage_limit_bytes: number | null;
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

function formatPrice(cents: number | null, t: BillingTranslator): string {
  if (cents === null) return t("contactUs");
  return cents === 0 ? t("free") : `€${(cents / 100).toFixed(2)}${t("perMonth")}`;
}

export default async function BillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ checkout?: string }>;
}) {
  const { id: orgId } = await params;
  const { checkout } = await searchParams;
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

  const [{ data: plansData }, { data: subscriptionData }, projectCount, planLimits, storageUsage] = await Promise.all([
    supabase.from("plans").select("*").order("sort_order"),
    supabase.from("subscriptions").select("plan_id, status").eq("organization_id", orgId).maybeSingle(),
    supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId),
    getOrgPlanLimits(orgId),
    getOrganizationStorageUsage(orgId),
  ]);

  const plans = (plansData ?? []) as PlanRow[];
  const currentProjectCount = projectCount.count ?? 0;
  const currentPlanId = subscriptionData?.plan_id ?? "free";
  // "Manage billing" (Stripe Customer Portal - can upgrade/downgrade/cancel
  // there too) replaces per-plan Upgrade buttons once there's an active paid
  // subscription to manage; Free/canceled orgs get per-plan Upgrade buttons
  // (a fresh Checkout Session) instead, since there's nothing for the Portal
  // to manage yet.
  const hasActivePaidSubscription =
    currentPlanId !== "free" && (subscriptionData?.status === "active" || subscriptionData?.status === "trialing");

  const usageRows = [
    { label: t("projectsLabel"), used: currentProjectCount, limit: planLimits.projectLimit, format: (v: number | null) => formatCount(v, t) },
    { label: t("storageLabel"), used: storageUsage, limit: planLimits.storageLimitBytes, format: (v: number | null) => formatBytes(v, t) },
  ];

  return (
    <AppShell user={user}>
      <div className="container mx-auto max-w-7xl px-6 py-8">
        <div className="flex items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link href={`/organizations/${orgId}`} aria-label={t("backToOrganization")}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-3xl font-bold">{t("title")}</h1>
              <p className="text-muted-foreground">{t("currentPlan", { plan: planLimits.planName })}</p>
            </div>
          </div>
          {canManageBilling && hasActivePaidSubscription && (
            <ManageBillingButton organizationId={orgId} label={t("manageBilling")} />
          )}
        </div>

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

        <Card>
          <CardHeader>
            <CardTitle>{t("plansTitle")}</CardTitle>
            <CardDescription>{t("plansDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground [&>th]:px-4 [&>th]:py-2 [&>th]:font-medium">
                  <th>{t("colPlan")}</th>
                  <th>{t("colPrice")}</th>
                  <th>{t("colProjects")}</th>
                  <th>{t("colTasksPerProject")}</th>
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
                  return (
                    <tr key={plan.id} className={`[&>td]:px-4 [&>td]:py-3 ${isCurrent ? "bg-primary/5" : ""}`}>
                      <td className="font-medium">{plan.name}</td>
                      <td>
                        {formatPrice(plan.price_cents, t)}
                        {plan.price_cents !== null && plan.price_cents > 0 && !isCurrent && (
                          <div className="text-xs text-muted-foreground">{t("trialNotice", { days: TRIAL_PERIOD_DAYS })}</div>
                        )}
                      </td>
                      <td>{formatCount(plan.project_limit, t)}</td>
                      <td>{formatCount(plan.task_limit_per_project, t)}</td>
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
                            plan.stripe_price_id && <UpgradeButton organizationId={orgId} planId={plan.id} label={t("upgrade")} />
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
