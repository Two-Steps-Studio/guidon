import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, CreditCard, FolderKanban, Plus, Settings, Users } from "lucide-react";
import { canManageOrg, requireOrgAccess } from "@/lib/data/org-access";
import { createClient } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/data/current-user";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { isHostedProjectLimitReached, hostedProjectLimitMessage } from "@/lib/limits";
import { AppShell } from "@/components/layout/app-shell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CreateProjectDialog } from "./create-project-dialog";
import { OrgAvatarUpload } from "./org-avatar-upload";
import type { Project } from "@/types/project";

export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: orgId } = await params;
  const [access, user] = await Promise.all([requireOrgAccess(orgId), getCurrentUser()]);
  const { organization } = access;

  let projects: Project[];

  if (hasDirectDatabase()) {
    const result = await withUser(access.userId, ({ query }) =>
      query("SELECT * FROM projects WHERE organization_id = $1 ORDER BY created_at DESC", [orgId])
    );
    projects = result.rows;
  } else {
    const supabase = await createClient();
    const { data: projectsData } = await supabase
      .from("projects")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });

    projects = (projectsData ?? []) as Project[];
  }

  const limitReached = isHostedProjectLimitReached(projects.length, organization.project_limit);

  return (
    <AppShell user={user}>
      <div className="container mx-auto max-w-7xl px-6 py-8">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/organizations">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <OrgAvatarUpload
            orgId={orgId}
            name={organization.name}
            avatarUrl={organization.avatar_url}
            canEdit={canManageOrg(access.role)}
          />
          <div className="flex-1">
            <h1 className="text-3xl font-bold">{organization.name}</h1>
            <p className="text-muted-foreground">{organization.description || "No description"}</p>
          </div>
          <Button variant="outline" asChild>
            <Link href={`/organizations/${orgId}/members`}>
              <Users className="h-4 w-4 mr-2" />
              Members
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/organizations/${orgId}/billing`}>
              <CreditCard className="h-4 w-4 mr-2" />
              Billing
            </Link>
          </Button>
          {canManageOrg(access.role) && (
            <Button variant="outline" asChild>
              <Link href={`/organizations/${orgId}/settings`}>
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Link>
            </Button>
          )}
        </div>

        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">Projects</h2>
          {!limitReached && <CreateProjectDialog orgId={orgId} orgName={organization.name} />}
        </div>

        {limitReached && (
          <Card className="mb-6 border-dashed">
            <CardContent className="py-4 text-sm text-muted-foreground">
              {hostedProjectLimitMessage(organization.project_limit)}
            </CardContent>
          </Card>
        )}

        {projects.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FolderKanban className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No projects yet</h3>
              <p className="text-muted-foreground text-center mb-4">
                Create your first project to start managing work
              </p>
              {!limitReached && (
                <CreateProjectDialog
                  orgId={orgId}
                  orgName={organization.name}
                  trigger={
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Project
                    </Button>
                  }
                />
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <Link key={project.id} href={`/projects/${project.id}`}>
                <Card className="cursor-pointer hover:border-primary transition-colors h-full">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Avatar className="h-5 w-5 rounded-sm">
                        <AvatarImage src={project.avatar_url || undefined} alt={project.name} className="object-cover" />
                        <AvatarFallback className="rounded-sm bg-transparent">
                          <FolderKanban className="h-5 w-5" />
                        </AvatarFallback>
                      </Avatar>
                      {project.name}
                    </CardTitle>
                    <CardDescription>{project.description || "No description"}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-end text-sm">
                      <span className="text-muted-foreground">
                        {new Date(project.created_at).toLocaleDateString()}
                      </span>
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
