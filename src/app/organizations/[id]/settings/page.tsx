import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { canManageOrg, requireOrgAccess } from "@/lib/data/org-access";
import { getCurrentUser } from "@/lib/data/current-user";
import { getOrgAiSettingsSafe } from "@/lib/data/organization-ai-settings";
import { AppShell } from "@/components/layout/app-shell";
import { hasDirectDatabase } from "@/lib/db/pool";
import { MAX_WEBHOOKS_PER_ORGANIZATION, listOrganizationWebhooks } from "@/lib/data/organization-webhooks";
import { AiSettingsForm } from "./ai-settings-form";
import { WebhooksSection } from "./webhooks-section";

export default async function OrganizationSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: orgId } = await params;
  const t = await getTranslations("organizations.settings");
  const [access, user] = await Promise.all([requireOrgAccess(orgId), getCurrentUser()]);

  const canManage = canManageOrg(access.role);
  // Webhooks are owner/admin-only under RLS (050), so members wouldn't see any anyway.
  const [configured, webhooks] = await Promise.all([
    getOrgAiSettingsSafe(orgId, access.userId),
    canManage
      ? // Hide the section rather than fail the whole page (e.g. migration 050 not applied yet).
        listOrganizationWebhooks(orgId, access.userId).catch((error) => {
          console.error("Failed to load organization webhooks:", error);
          return null;
        })
      : Promise.resolve(null),
  ]);

  return (
    <AppShell user={user}>
      <div className="container mx-auto max-w-4xl px-6 py-8 space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/organizations/${orgId}`} aria-label={t("backToOrganization")}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{t("title")}</h1>
            <p className="text-muted-foreground">{access.organization.name}</p>
          </div>
        </div>

        <AiSettingsForm
          organizationId={orgId}
          configured={configured}
          canManage={canManage}
        />

        {webhooks && (
          <WebhooksSection
            organizationId={orgId}
            webhooks={webhooks}
            maxWebhooks={MAX_WEBHOOKS_PER_ORGANIZATION}
            allowHttp={hasDirectDatabase()}
          />
        )}
      </div>
    </AppShell>
  );
}
