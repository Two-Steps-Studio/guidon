import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Building2, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/data/current-user";
import { canManageOrg } from "@/lib/data/org-access";
import { dataClient } from "@/lib/data-client";
import type { OrganizationRole } from "@/types/project";

interface MembershipRow {
  organization_id: string;
  role: OrganizationRole;
}

interface OrganizationRow {
  id: string;
  name: string;
}

/**
 * "Upgrade plan" from anywhere in the app (sidebar, pricing section) - plans
 * belong to an organization, so this only picks which one and hands off to
 * its billing page, which owns Checkout and the Customer Portal. Anyone who
 * can't manage an organization's billing (canManageOrg) isn't offered it.
 */
export default async function UpgradePage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const { plan } = await searchParams;
  const t = await getTranslations("upgrade");
  const user = await getCurrentUser();
  const db = dataClient(user.id);

  const { data: memberships } = await db
    .from<MembershipRow>("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id);
  const manageableIds = (memberships ?? [])
    .filter((membership) => canManageOrg(membership.role))
    .map((membership) => membership.organization_id);

  const { data: organizations } = manageableIds.length
    ? await db.from<OrganizationRow>("organizations").select("id, name").in("id", manageableIds).order("name")
    : { data: [] as OrganizationRow[] };

  const query = plan ? `?plan=${encodeURIComponent(plan)}` : "";
  const billingHref = (orgId: string) => `/organizations/${orgId}/billing${query}`;

  if (organizations?.length === 1) {
    redirect(billingHref(organizations[0].id));
  }

  return (
    <AppShell user={user}>
      <div className="container mx-auto max-w-2xl px-6 py-8">
        <h1 className="mb-2 text-3xl font-bold">{t("title")}</h1>
        <p className="mb-8 text-muted-foreground">{t("description")}</p>

        {organizations && organizations.length > 0 ? (
          <div className="space-y-3">
            {organizations.map((organization) => (
              <Link key={organization.id} href={billingHref(organization.id)} className="block">
                <Card className="transition-colors hover:bg-muted/50">
                  <CardContent className="flex items-center gap-3 py-4">
                    <Building2 className="h-5 w-5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate font-medium">{organization.name}</span>
                    <span className="text-sm text-muted-foreground">{t("choosePlan")}</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>{t("noOrganizationsTitle")}</CardTitle>
              <CardDescription>{t("noOrganizationsDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href="/organizations?create=1">{t("createOrganization")}</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
