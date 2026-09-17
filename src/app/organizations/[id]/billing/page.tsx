import Link from "next/link";
import { ArrowLeft, Check, Minus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AppShell } from "@/components/layout/app-shell";
import { requireOrgAccess } from "@/lib/data/org-access";
import { getCurrentUser } from "@/lib/data/current-user";
import { getOrgPlanLimits } from "@/lib/limits";
import { getOrganizationStorageUsage } from "@/lib/storage/storage";
import { hasDirectDatabase } from "@/lib/db/pool";
import { createServiceClient } from "@/lib/supabase-server";

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
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: orgId } = await params;
  const t = await getTranslations("organizations.billing");
  const [, user] = await Promise.all([requireOrgAccess(orgId), getCurrentUser()]);

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

  const [{ data: plansData }, projectCount, planLimits, storageUsage] = await Promise.all([
    supabase.from("plans").select("*").order("sort_order"),
    supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId),
    getOrgPlanLimits(orgId),
    getOrganizationStorageUsage(orgId),
  ]);

  const plans = (plansData ?? []) as PlanRow[];
  const currentProjectCount = projectCount.count ?? 0;

  const usageRows = [
    { label: t("projectsLabel"), used: currentProjectCount, limit: planLimits.projectLimit, format: (v: number | null) => formatCount(v, t) },
    { label: t("storageLabel"), used: storageUsage, limit: planLimits.storageLimitBytes, format: (v: number | null) => formatBytes(v, t) },
  ];

  return (
    <AppShell user={user}>
      <div className="container mx-auto max-w-7xl px-6 py-8">
        <div className="flex items-center gap-4 mb-8">
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
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {plans.map((plan) => (
                  <tr
                    key={plan.id}
                    className={`[&>td]:px-4 [&>td]:py-3 ${plan.name === planLimits.planName ? "bg-primary/5" : ""}`}
                  >
                    <td className="font-medium">{plan.name}</td>
                    <td>{formatPrice(plan.price_cents, t)}</td>
                    <td>{formatCount(plan.project_limit, t)}</td>
                    <td>{formatCount(plan.task_limit_per_project, t)}</td>
                    <td>{formatBytes(plan.storage_limit_bytes, t)}</td>
                    <td>{plan.has_ai_features ? <Check className="h-4 w-4 text-success" /> : <Minus className="h-4 w-4 text-muted-foreground" />}</td>
                    <td>{plan.has_github_integration ? <Check className="h-4 w-4 text-success" /> : <Minus className="h-4 w-4 text-muted-foreground" />}</td>
                    <td>{plan.has_team_roles ? <Check className="h-4 w-4 text-success" /> : <Minus className="h-4 w-4 text-muted-foreground" />}</td>
                    <td>{plan.has_audit_logs ? <Check className="h-4 w-4 text-success" /> : <Minus className="h-4 w-4 text-muted-foreground" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
