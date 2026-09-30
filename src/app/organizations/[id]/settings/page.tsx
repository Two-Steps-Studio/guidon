import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { canManageOrg, requireOrgAccess } from "@/lib/data/org-access";
import { getCurrentUser } from "@/lib/data/current-user";
import { getOrgAiSettingsSafe } from "@/lib/data/organization-ai-settings";
import { AppShell } from "@/components/layout/app-shell";
import { dataClient } from "@/lib/data-client";
import { AiSettingsForm } from "./ai-settings-form";
import { MemberLimitForm } from "./member-limit-form";

export default async function OrganizationSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: orgId } = await params;
  const t = await getTranslations("organizations.settings");
  const [access, user] = await Promise.all([requireOrgAccess(orgId), getCurrentUser()]);

  const [configured, memberLimit] = await Promise.all([
    getOrgAiSettingsSafe(orgId, access.userId),
    // Read on its own rather than via getOrgAccess: an instance running this
    // code before migration 049 gets an error here (column missing) and a
    // disabled card, not a broken organization page.
    dataClient(access.userId)
      .from<{ member_project_limit: number | null }>("organizations")
      .select("member_project_limit")
      .eq("id", orgId)
      .maybeSingle(),
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
          canManage={canManageOrg(access.role)}
        />

        <MemberLimitForm
          organizationId={orgId}
          limit={memberLimit.data?.member_project_limit ?? null}
          available={!memberLimit.error}
          canManage={canManageOrg(access.role)}
        />
      </div>
    </AppShell>
  );
}
