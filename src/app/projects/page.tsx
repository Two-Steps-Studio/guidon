import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Plus, ArrowRight, FolderKanban, Building2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getCurrentUser } from "@/lib/data/current-user";
import { createClient } from "@/lib/supabase-server";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { PROJECT_LIST_SAFETY_CAP } from "@/lib/limits";
import { ImportProjectDialog } from "./import-project-dialog";

interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  avatar_url: string | null;
  project_type: string | null;
  organizations: { id: string; name: string } | null;
}

interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  avatar_url: string | null;
  user_role: string;
}

/** Raw shape of the Supabase-hosted branch's organization_members row - matches exactly the columns selected below (role plus the joined organizations row), typed as a single object to match how the spread just below already treats it. */
interface SupabaseMembershipRow {
  role: string;
  organizations: Omit<OrganizationRow, "user_role">;
}

export default async function ProjectsPage() {
  const t = await getTranslations("projects.list");
  const tCommon = await getTranslations("common");
  const user = await getCurrentUser();

  let organizations: OrganizationRow[];
  let projects: ProjectRow[];

  if (hasDirectDatabase()) {
    // Two withUser() calls, not one wrapping Promise.all([query, query]) -
    // each checks out its own pooled connection, so this is genuinely
    // concurrent instead of firing multiple queries on one pg client (the
    // deprecated shape, removed in pg@9).
    const [orgResult, projectResult] = await Promise.all([
      withUser(user.id, ({ query }) =>
        query(
          `SELECT o.id, o.name, o.slug, o.description, o.avatar_url, om.role
           FROM organization_members om
           JOIN organizations o ON o.id = om.organization_id
           WHERE om.user_id = $1`,
          [user.id]
        )
      ),
      withUser(user.id, ({ query }) =>
        query(
          `SELECT p.id, p.name, p.description, p.status, p.avatar_url, p.project_type, o.id AS org_id, o.name AS org_name
           FROM projects p
           JOIN organizations o ON o.id = p.organization_id
           ORDER BY p.created_at DESC
           LIMIT $1`,
          [PROJECT_LIST_SAFETY_CAP]
        )
      ),
    ]);

    organizations = orgResult.rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      avatar_url: row.avatar_url,
      user_role: row.role,
    }));
    projects = projectResult.rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      status: row.status,
      avatar_url: row.avatar_url,
      project_type: row.project_type,
      organizations: row.org_id ? { id: row.org_id, name: row.org_name } : null,
    }));
  } else {
    const supabase = await createClient();

    const [orgResult, projectResult] = await Promise.all([
      supabase
        .from("organization_members")
        .select("role, organizations (id, name, slug, description, avatar_url)")
        .eq("user_id", user.id),
      supabase
        .from("projects")
        .select("id, name, description, status, avatar_url, project_type, organizations (id, name)")
        .order("created_at", { ascending: false })
        .limit(PROJECT_LIST_SAFETY_CAP),
    ]);

    organizations = ((orgResult.data ?? []) as unknown as SupabaseMembershipRow[]).map((member) => ({
      ...member.organizations,
      user_role: member.role,
    }));
    projects = (projectResult.data ?? []) as unknown as ProjectRow[];
  }

  return (
    <AppShell user={user}>
      <div className="container mx-auto max-w-7xl px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">{t("title")}</h1>
            <p className="text-muted-foreground">{t("subtitle")}</p>
          </div>
          <div className="flex items-center gap-2">
            <ImportProjectDialog
              organizations={organizations.map((org) => ({ id: org.id, name: org.name }))}
              projects={projects.map((project) => ({ id: project.id, name: project.name }))}
            />
            {organizations.length > 0 && (
              <Button asChild>
                <Link href="/organizations">
                  <Plus className="h-4 w-4 mr-2" />
                  {t("newProject")}
                </Link>
              </Button>
            )}
          </div>
        </div>

        {organizations.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">{t("yourOrganizations")}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {organizations.map((org) => (
                <Link key={org.id} href={`/organizations/${org.id}`}>
                  <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Avatar className="h-5 w-5 rounded-sm">
                            <AvatarImage src={org.avatar_url || undefined} alt={org.name} className="object-cover" />
                            <AvatarFallback className="rounded-sm bg-transparent">
                              <Building2 className="h-5 w-5" />
                            </AvatarFallback>
                          </Avatar>
                          {org.name}
                        </CardTitle>
                        <Badge variant="outline">{tCommon("role", { role: org.user_role })}</Badge>
                      </div>
                      <CardDescription>{org.slug}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {org.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {org.description}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">{t("allProjects")}</h2>
        </div>

        {projects.length === 0 ? (
          <EmptyState
            icon={FolderKanban}
            title={t("emptyTitle")}
            description={
              organizations.length === 0
                ? t("emptyDescriptionNoOrg")
                : t("emptyDescriptionHasOrg")
            }
            action={
              organizations.length === 0 ? (
                <Button asChild>
                  <Link href="/organizations">
                    <Plus className="h-4 w-4 mr-2" />
                    {t("createOrganization")}
                  </Link>
                </Button>
              ) : (
                <Button asChild>
                  <Link href="/organizations">
                    <Plus className="h-4 w-4 mr-2" />
                    {t("createProject")}
                  </Link>
                </Button>
              )
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <Link key={project.id} href={`/projects/${project.id}`}>
                <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Avatar className="h-5 w-5 rounded-sm">
                        <AvatarImage src={project.avatar_url || undefined} alt={project.name} className="object-cover" />
                        <AvatarFallback className="rounded-sm bg-transparent">
                          <FolderKanban className="h-5 w-5" />
                        </AvatarFallback>
                      </Avatar>
                      {project.name}
                    </CardTitle>
                    <CardDescription>{project.organizations?.name}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {project.project_type && (
                      <Badge variant="outline" className="mb-2">
                        {tCommon("projectType", { type: project.project_type })}
                      </Badge>
                    )}
                    {project.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                        {project.description}
                      </p>
                    )}
                    <div className="flex items-center text-sm text-muted-foreground">
                      <ArrowRight className="h-4 w-4 mr-1" />
                      {t("openProject")}
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
