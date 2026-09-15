import { CheckCircle2, MinusCircle } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireAdminAccess } from "@/lib/data/admin-access";
import { activeStorageProviderName } from "@/lib/storage/provider";
import { activeAIProviderName } from "@/lib/ai/provider";

/**
 * Masked config-presence row (TODO.md §25's own example: "API key: ••••••••••••").
 * `isSet` never carries the secret itself - only whether the env var is non-empty.
 */
function MaskedRow({ label, isSet, notSetLabel }: { label: string; isSet: boolean; notSetLabel: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{isSet ? "••••••••••••" : notSetLabel}</span>
    </div>
  );
}

/**
 * Integrations + Environment (TODO.md §25) in one page - both are compact
 * status summaries and Environment necessarily overlaps in content with
 * Storage/AI/Auth/Integrations above it, so splitting them into separate
 * pages would mostly duplicate the same few lookups across two files.
 */
export default async function AdminIntegrationsPage() {
  await requireAdminAccess();
  const t = await getTranslations("admin");

  const githubClientId = Boolean(process.env.GITHUB_APP_CLIENT_ID?.trim());
  const githubClientSecret = Boolean(process.env.GITHUB_APP_CLIENT_SECRET?.trim());
  const githubAppSlug = Boolean(process.env.GITHUB_APP_SLUG?.trim());
  const githubConfigured = githubClientId && githubClientSecret && githubAppSlug;

  let storageProvider: string | null = null;
  try {
    storageProvider = activeStorageProviderName();
  } catch {
    storageProvider = null;
  }

  let aiProvider: string | null = null;
  try {
    aiProvider = activeAIProviderName();
  } catch {
    aiProvider = null;
  }

  const authProviders = (process.env.NEXT_PUBLIC_AUTH_PROVIDERS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return (
    <div className="container mx-auto max-w-7xl space-y-10 px-6 py-8">
      <section className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold">{t("integrationsTitle")}</h2>
          <p className="text-muted-foreground">
            {t("integrationsDescription")}
          </p>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>{t("github")}</CardTitle>
              <CardDescription>{t("githubCredentialsDescription")}</CardDescription>
            </div>
            <Badge
              variant="outline"
              className={
                githubConfigured
                  ? "border-success/30 bg-success/15 text-success"
                  : "border-border bg-muted text-muted-foreground"
              }
            >
              {githubConfigured ? <CheckCircle2 className="h-3 w-3" /> : <MinusCircle className="h-3 w-3" />}
              {githubConfigured ? t("configured") : t("statusNotConfigured")}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            <MaskedRow label="GITHUB_APP_CLIENT_ID" isSet={githubClientId} notSetLabel={t("notConfigured")} />
            <MaskedRow label="GITHUB_APP_CLIENT_SECRET" isSet={githubClientSecret} notSetLabel={t("notConfigured")} />
            <MaskedRow label="GITHUB_APP_SLUG" isSet={githubAppSlug} notSetLabel={t("notConfigured")} />
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold">{t("environmentTitle")}</h2>
          <p className="text-muted-foreground">{t("environmentDescription")}</p>
        </div>

        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                <tr className="[&>td]:px-4 [&>td]:py-3">
                  <td className="text-muted-foreground">{t("storageProviderRowLabel")}</td>
                  <td className="font-medium capitalize">{storageProvider ?? t("invalidConfiguration")}</td>
                </tr>
                <tr className="[&>td]:px-4 [&>td]:py-3">
                  <td className="text-muted-foreground">{t("aiProviderLabel")}</td>
                  <td className="font-medium capitalize">{aiProvider ?? t("notConfigured")}</td>
                </tr>
                <tr className="[&>td]:px-4 [&>td]:py-3">
                  <td className="text-muted-foreground">{t("authProvidersRowLabel")}</td>
                  <td className="font-medium">
                    {authProviders.length > 0 ? authProviders.join(", ") : t("passwordOnly")}
                  </td>
                </tr>
                <tr className="[&>td]:px-4 [&>td]:py-3">
                  <td className="text-muted-foreground">{t("githubIntegrationRowLabel")}</td>
                  <td className="font-medium">{githubConfigured ? t("configuredLower") : t("notConfigured")}</td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
