import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentUser } from "@/lib/data/current-user";
import { canManageOrg, requireOrgAccess } from "@/lib/data/org-access";
import { listAiAccounts } from "@/lib/data/ai-accounts";
import { dataClient } from "@/lib/data-client";
import { SITE_URL } from "@/lib/site-url";
import { AiAccountsManager } from "./ai-accounts-manager";

export const metadata: Metadata = { title: "AI accounts" };

export default async function AiAccountsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: orgId } = await params;
  const [t, access, user] = await Promise.all([getTranslations("aiAccounts"), requireOrgAccess(orgId), getCurrentUser()]);
  const canManage = canManageOrg(access.role);

  const [accounts, projects] = canManage
    ? await Promise.all([
        listAiAccounts(orgId),
        dataClient(user.id)
          .from<{ id: string; name: string }>("projects")
          .select("id, name")
          .eq("organization_id", orgId)
          .order("name", { ascending: true }),
      ])
    : [null, null];

  return (
    <AppShell user={user}>
      <div className="container mx-auto max-w-4xl px-6 py-8">
        <div className="mb-8 flex items-start gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/organizations/${orgId}`} aria-label={access.organization.name}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{t("title")}</h1>
            <p className="text-muted-foreground">{t("subtitle", { org: access.organization.name })}</p>
          </div>
        </div>
        {!canManage ? (
          <p className="text-muted-foreground">{t("managersOnly")}</p>
        ) : accounts?.error ? (
          <p className="text-destructive">{accounts.error}</p>
        ) : (
          <AiAccountsManager
            orgId={orgId}
            siteUrl={SITE_URL}
            accounts={accounts?.data ?? []}
            projects={projects?.data ?? []}
          />
        )}
      </div>
    </AppShell>
  );
}
