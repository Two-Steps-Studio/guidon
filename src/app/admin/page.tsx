import { AlertTriangle, CheckCircle2, CreditCard, Database, HardDrive, KeyRound, MinusCircle, Sparkles, XCircle } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireAdminAccess } from "@/lib/data/admin-access";
import { getAdminCounts } from "@/lib/data/admin";
import { hasAdminPermission } from "@/lib/admin/permissions";
import { checkAI, checkAuth, checkBilling, checkDatabase, checkStorage, type Status } from "@/lib/health/checks";
import { RollingNumber } from "@/components/ui/rolling-number";

const STATUS_ICONS: Record<Status, { className: string; Icon: typeof CheckCircle2 }> = {
  ok: { className: "border-success/30 bg-success/15 text-success", Icon: CheckCircle2 },
  degraded: { className: "border-warning/30 bg-warning/15 text-warning", Icon: AlertTriangle },
  down: { className: "border-destructive/30 bg-destructive/15 text-destructive", Icon: XCircle },
  not_configured: { className: "border-border bg-muted text-muted-foreground", Icon: MinusCircle },
};

function StatusBadge({ status, label }: { status: Status; label: string }) {
  const { className, Icon } = STATUS_ICONS[status];
  return (
    <Badge variant="outline" className={className}>
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}

/**
 * Admin overview (TODO.md §25) - System Status, Database, Storage, AI
 * Provider, Authentication in one page, since all five are read from the
 * same four health checks (src/lib/health/checks.ts) plus one counts query.
 */
export default async function AdminOverviewPage() {
  const { role } = await requireAdminAccess("overview.read");
  const t = await getTranslations("admin");
  const tNav = await getTranslations("nav");

  const STATUS_LABELS: Record<Status, string> = {
    ok: t("statusOk"),
    degraded: t("statusDegraded"),
    down: t("statusDown"),
    not_configured: t("statusNotConfigured"),
  };

  const canReadHealth = hasAdminPermission(role, "integrations.read");
  const [database, storage, ai, counts] = await Promise.all([
    canReadHealth ? checkDatabase() : null,
    canReadHealth ? checkStorage() : null,
    canReadHealth ? checkAI() : null,
    getAdminCounts(),
  ]);
  const auth = canReadHealth ? checkAuth() : null;
  const billing = canReadHealth ? checkBilling() : null;

  return (
    <div className="container mx-auto max-w-7xl space-y-10 px-6 py-8">
      <h1 className="sr-only">{tNav("adminGroup")}</h1>
      {database && storage && ai && auth && billing && <section className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold">{t("systemStatusTitle")}</h2>
          <p className="text-muted-foreground">{t("systemStatusDescription")}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Database className="h-4 w-4" /> {t("database")}
              </CardTitle>
              <StatusBadge status={database.status} label={STATUS_LABELS[database.status]} />
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {database.status === "ok" && typeof database.latency_ms === "number"
                  ? `${database.latency_ms}ms`
                  : (database.detail ?? "-")}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <HardDrive className="h-4 w-4" /> {t("storage")}
              </CardTitle>
              <StatusBadge status={storage.status} label={STATUS_LABELS[storage.status]} />
            </CardHeader>
            <CardContent>
              <p className="text-sm capitalize text-muted-foreground">
                {storage.provider ?? storage.detail ?? "-"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="h-4 w-4" /> {t("aiProviderLabel")}
              </CardTitle>
              <StatusBadge status={ai.status} label={STATUS_LABELS[ai.status]} />
            </CardHeader>
            <CardContent>
              <p className="text-sm capitalize text-muted-foreground">
                {ai.provider ?? ai.detail ?? t("notConfigured")}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <KeyRound className="h-4 w-4" /> {t("authentication")}
              </CardTitle>
              <StatusBadge status={auth.status} label={STATUS_LABELS[auth.status]} />
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {auth.providers ? auth.providers.join(", ") : (auth.detail ?? "-")}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <CreditCard className="h-4 w-4" /> {t("billingLabel")}
              </CardTitle>
              <StatusBadge status={billing.status} label={STATUS_LABELS[billing.status]} />
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{billing.detail ?? "-"}</p>
            </CardContent>
          </Card>
        </div>
      </section>}

      <section className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold">{t("database")}</h2>
          <p className="text-muted-foreground">{t("databaseSectionDescription")}</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t("organizations")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold"><RollingNumber value={counts.organizations} /></p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t("projects")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold"><RollingNumber value={counts.projects} /></p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t("users")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold"><RollingNumber value={counts.users} /></p>
            </CardContent>
          </Card>
        </div>
      </section>

      {storage && <section className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold">{t("storage")}</h2>
          <p className="text-muted-foreground">{t("storageSectionDescription")}</p>
        </div>
        <Card>
          <CardContent className="flex items-center justify-between pt-6">
            <div>
              <p className="font-medium capitalize">{storage.provider ?? t("unknown")}</p>
              <p className="text-sm text-muted-foreground">{storage.detail ?? t("activeStorageProviderFallback")}</p>
            </div>
            <StatusBadge status={storage.status} label={STATUS_LABELS[storage.status]} />
          </CardContent>
        </Card>
      </section>}

      {ai && <section className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold">{t("aiProviderSectionTitle")}</h2>
          <p className="text-muted-foreground">{t("aiProviderSectionDescription")}</p>
        </div>
        <Card>
          <CardContent className="flex items-center justify-between pt-6">
            <div>
              <p className="font-medium capitalize">{ai.provider ?? t("notConfigured")}</p>
              {ai.model ? (
                <p className="text-sm text-muted-foreground">{t("modelLabel", { model: ai.model })}</p>
              ) : (
                <p className="text-sm text-muted-foreground">{ai.detail ?? t("noAiProviderConfigured")}</p>
              )}
            </div>
            <StatusBadge status={ai.status} label={STATUS_LABELS[ai.status]} />
          </CardContent>
        </Card>
      </section>}

      {auth && <section className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold">{t("authentication")}</h2>
          <p className="text-muted-foreground">{t("authSectionDescription")}</p>
        </div>
        <Card>
          <CardContent className="flex items-center justify-between pt-6">
            <div className="flex flex-wrap gap-2">
              {auth.providers ? (
                auth.providers.map((provider) => (
                  <Badge key={provider} variant="secondary" className="capitalize">
                    {provider}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">{auth.detail}</span>
              )}
            </div>
            <StatusBadge status={auth.status} label={STATUS_LABELS[auth.status]} />
          </CardContent>
        </Card>
      </section>}
    </div>
  );
}
