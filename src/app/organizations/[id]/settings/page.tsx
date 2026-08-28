import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { canManageOrg, requireOrgAccess } from "@/lib/data/org-access";
import { getCurrentUser } from "@/lib/data/current-user";
import { getOrgAiSettingsSafe } from "@/lib/data/organization-ai-settings";
import { AppShell } from "@/components/layout/app-shell";
import { AiSettingsForm } from "./ai-settings-form";

export default async function OrganizationSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: orgId } = await params;
  const [access, user] = await Promise.all([requireOrgAccess(orgId), getCurrentUser()]);

  const configured = await getOrgAiSettingsSafe(orgId, access.userId);

  return (
    <AppShell user={user}>
      <div className="container mx-auto max-w-4xl px-6 py-8 space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/organizations/${orgId}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Organization Settings</h1>
            <p className="text-muted-foreground">{access.organization.name}</p>
          </div>
        </div>

        <AiSettingsForm
          organizationId={orgId}
          configured={configured}
          canManage={canManageOrg(access.role)}
        />
      </div>
    </AppShell>
  );
}
