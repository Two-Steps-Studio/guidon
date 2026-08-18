import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, ArrowRight, FolderKanban } from "lucide-react";
import { Navigation } from "@/components/layout/navigation";
import { getCurrentUser } from "@/lib/data/current-user";
import { createClient } from "@/lib/supabase-server";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { isDone } from "@/lib/work/task-board";

interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  organizations: { id: string; name: string } | null;
}

/**
 * Self-hosted path: no PostgREST, so the same three queries the Supabase
 * branch below expresses with `.from()` are written as SQL and run under
 * withUser() — RLS applies identically either way, since both paths end up
 * as `SET LOCAL ROLE authenticated` + the same policies (see
 * src/lib/db/session.ts). This is the first page in the app proven to render
 * end-to-end against a plain PostgreSQL with no Supabase software running;
 * every other page still requires Supabase's REST layer until converted the
 * same way (see docs/self-hosting.md).
 */
async function loadDashboardDataLocal(userId: string) {
  return withUser(userId, async ({ query }) => {
    const projectsResult = await query(
      `SELECT p.id, p.name, p.description, p.status, o.id AS org_id, o.name AS org_name
       FROM projects p
       JOIN organizations o ON o.id = p.organization_id
       ORDER BY p.created_at DESC`
    );

    const projects: ProjectRow[] = projectsResult.rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      status: row.status,
      organizations: row.org_id ? { id: row.org_id, name: row.org_name } : null,
    }));

    const projectIds = projects.map((p) => p.id);

    let tasks: { status: string; parent_task_id: string | null }[] = [];
    let totalDecisions = 0;

    if (projectIds.length > 0) {
      const [tasksResult, decisionsResult] = await Promise.all([
        query("SELECT status, parent_task_id FROM tasks WHERE project_id = ANY($1::uuid[])", [
          projectIds,
        ]),
        query("SELECT id FROM context_decisions WHERE project_id = ANY($1::uuid[])", [projectIds]),
      ]);
      tasks = tasksResult.rows;
      totalDecisions = decisionsResult.rows.length;
    }

    return { projects, tasks, totalDecisions };
  });
}

export default async function DashboardPage() {
  const user = await getCurrentUser();

  let projects: ProjectRow[];
  let rawTasks: { status: string; parent_task_id: string | null }[];
  let totalDecisions: number;

  if (hasDirectDatabase()) {
    const data = await loadDashboardDataLocal(user.id);
    projects = data.projects;
    rawTasks = data.tasks;
    totalDecisions = data.totalDecisions;
  } else {
    const supabase = await createClient();

    const { data: projectsData } = await supabase
      .from("projects")
      .select("id, name, description, status, organizations (id, name)")
      .order("created_at", { ascending: false });

    projects = (projectsData ?? []) as unknown as ProjectRow[];
    const projectIds = projects.map((p) => p.id);

    rawTasks = [];
    totalDecisions = 0;

    if (projectIds.length > 0) {
      const [tasksRes, decisionsRes] = await Promise.all([
        supabase.from("tasks").select("status, parent_task_id").in("project_id", projectIds),
        supabase.from("context_decisions").select("id").in("project_id", projectIds),
      ]);

      rawTasks = tasksRes.data ?? [];
      totalDecisions = decisionsRes.data?.length ?? 0;
    }
  }

  // Subtasks (migration 010) are plain `tasks` rows — count top-level tasks
  // only, matching src/lib/data/project-stats.ts and the work board, so a
  // task with subtasks isn't counted twice in the dashboard totals.
  const tasks = rawTasks.filter((t) => !t.parent_task_id);
  const totalTasks = tasks.length;
  // isDone folds the legacy 'completed' status onto 'done' (migration
  // 002 renamed the vocabulary) — comparing to 'completed' directly
  // silently shows 0 for every task created since.
  const completedTasks = tasks.filter((t) => isDone(t.status)).length;

  const stats = {
    total_projects: projects.length,
    totalTasks,
    completedTasks,
    totalDecisions,
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation user={user} />

      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Welcome back, {user.full_name || "User"}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Projects
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total_projects}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Tasks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalTasks}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Completed Tasks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.completedTasks}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Decisions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalDecisions}</div>
            </CardContent>
          </Card>
        </div>

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold">Your Projects</h2>
          <Button asChild>
            <Link href="/organizations">
              <Plus className="h-4 w-4 mr-2" />
              New Project
            </Link>
          </Button>
        </div>

        {projects.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FolderKanban className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No projects yet</h3>
              <p className="text-muted-foreground text-center mb-4">
                Create your first project to get started with Guidon
              </p>
              <Button asChild>
                <Link href="/organizations">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Project
                </Link>
              </Button>
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
