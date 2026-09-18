import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Building2, Plus, Users } from "lucide-react";
import { createClient } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/data/current-user";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { AppShell } from "@/components/layout/app-shell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CreateOrganizationDialog } from "./create-organization-dialog";

interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  avatar_url: string | null;
  role: string;
}

/** Raw shape of the Supabase-hosted branch's row - matches exactly the columns selected below (role plus the joined organizations row), typed as a single object to match how the spread just below already treats it. */
interface SupabaseMembershipRow {
  role: string;
  organizations: Omit<OrganizationRow, "role">;
}

export default async function OrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<{ create?: string }>;
}) {
  const { create } = await searchParams;
  const t = await getTranslations("organizations");
  const user = await getCurrentUser();

  let organizations: OrganizationRow[];

  if (hasDirectDatabase()) {
    const result = await withUser(user.id, ({ query }) =>
      query(
        `SELECT o.id, o.name, o.slug, o.description, o.avatar_url, om.role
         FROM organization_members om
         JOIN organizations o ON o.id = om.organization_id
         WHERE om.user_id = $1`,
        [user.id]
      )
    );
    organizations = result.rows;
  } else {
    const supabase = await createClient();

    const { data } = await supabase
      .from("organization_members")
      .select("role, organizations (id, name, slug, description, avatar_url, created_at, updated_at)")
      .eq("user_id", user.id);

    organizations = ((data ?? []) as unknown as SupabaseMembershipRow[]).map((member) => ({
      ...member.organizations,
      role: member.role,
    }));
  }

  return (
    <AppShell user={user}>
      <div className="container mx-auto max-w-7xl px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">{t("list.title")}</h1>
            <p className="text-muted-foreground">{t("list.subtitle")}</p>
          </div>
          <CreateOrganizationDialog openOnMount={create === "1"} />
        </div>

        {organizations.length === 0 ? (
          <EmptyState
            icon={Building2}
            title={t("list.emptyTitle")}
            description={t("list.emptyDescription")}
            action={
              <CreateOrganizationDialog
                trigger={
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    {t("list.createOrganizationButton")}
                  </Button>
                }
              />
            }
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {organizations.map((org) => (
              <Link key={org.id} href={`/organizations/${org.id}`}>
                <Card className="cursor-pointer hover:border-primary transition-colors h-full">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Avatar className="h-5 w-5 rounded-sm">
                        <AvatarImage src={org.avatar_url || undefined} alt={org.name} className="object-cover" />
                        <AvatarFallback className="rounded-sm bg-transparent">
                          <Building2 className="h-5 w-5" />
                        </AvatarFallback>
                      </Avatar>
                      {org.name}
                    </CardTitle>
                    <CardDescription>{org.description || t("common.noDescription")}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center text-sm text-muted-foreground">
                      <Users className="h-4 w-4 mr-1" />
                      <span>{t("common.role", { role: org.role || "member" })}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
