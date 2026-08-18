import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, ArrowRight, FolderKanban, Building2 } from "lucide-react";
import { Navigation } from "@/components/layout/navigation";
import { getCurrentUser } from "@/lib/data/current-user";
import { createClient } from "@/lib/supabase-server";

interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  organizations: { id: string; name: string } | null;
}

interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  user_role: string;
}

export default async function ProjectsPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const [orgResult, projectResult] = await Promise.all([
    supabase
      .from("organization_members")
      .select("role, organizations (id, name, slug, description)")
      .eq("user_id", user.id),
    supabase
      .from("projects")
      .select("id, name, description, status, organizations (id, name)")
      .order("created_at", { ascending: false }),
  ]);

  const organizations: OrganizationRow[] = (orgResult.data ?? []).map((member: any) => ({
    ...member.organizations,
    user_role: member.role,
  }));
  const projects = (projectResult.data ?? []) as unknown as ProjectRow[];

  return (
    <div className="min-h-screen bg-background">
      <Navigation user={user} />

      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Projects</h1>
            <p className="text-muted-foreground">Manage your projects and organizations</p>
          </div>
          {organizations.length > 0 && (
            <Button asChild>
              <Link href="/organizations">
                <Plus className="h-4 w-4 mr-2" />
                New Project
              </Link>
            </Button>
          )}
        </div>

        {organizations.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">Your Organizations</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {organizations.map((org) => (
                <Link key={org.id} href={`/organizations/${org.id}`}>
                  <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Building2 className="h-5 w-5" />
                          {org.name}
                        </CardTitle>
                        <Badge variant="outline">{org.user_role}</Badge>
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
          <h2 className="text-xl font-semibold">All Projects</h2>
        </div>

        {projects.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FolderKanban className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No projects yet</h3>
              {organizations.length === 0 ? (
                <>
                  <p className="text-muted-foreground text-center mb-4">
                    Create an organization first to start managing projects
                  </p>
                  <Button asChild>
                    <Link href="/organizations">
                      <Plus className="h-4 w-4 mr-2" />
                      Create Organization
                    </Link>
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-muted-foreground text-center mb-4">
                    Create your first project to get started
                  </p>
                  <Button asChild>
                    <Link href="/organizations">
                      <Plus className="h-4 w-4 mr-2" />
                      Create Project
                    </Link>
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <Link key={project.id} href={`/projects/${project.id}`}>
                <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-lg">{project.name}</CardTitle>
                      <Badge variant={project.status === "active" ? "default" : "secondary"}>
                        {project.status}
                      </Badge>
                    </div>
                    <CardDescription>{project.organizations?.name}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {project.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                        {project.description}
                      </p>
                    )}
                    <div className="flex items-center text-sm text-muted-foreground">
                      <ArrowRight className="h-4 w-4 mr-1" />
                      Open project
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
