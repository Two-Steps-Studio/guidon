import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Plus, ArrowRight, FolderKanban, GitBranch, Network, BrainCircuit } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentUser } from "@/lib/data/current-user";
import { createClient } from "@/lib/supabase-server";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { PROJECT_LIST_SAFETY_CAP } from "@/lib/limits";
import { PROJECT_TYPE_LABELS, type ProjectType } from "@/types/project";

interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  avatar_url: string | null;
  project_type: string | null;
  organizations: { id: string; name: string } | null;
}

/**
 * Self-hosted path: no PostgREST, so the same three queries the Supabase
 * branch below expresses with `.from()` are written as SQL and run under
 * withUser() - RLS applies identically either way, since both paths end up
 * as `SET LOCAL ROLE authenticated` + the same policies (see
 * src/lib/db/session.ts). This is the first page in the app proven to render
 * end-to-end against a plain PostgreSQL with no Supabase software running;
 * every other page still requires Supabase's REST layer until converted the
 * same way (see docs/self-hosting.md).
 */
async function loadDashboardDataLocal(userId: string) {
  // The tasks/decisions queries need projectIds from this one first, so
  // they can't join the same withUser() call as a Promise.all - that would
  // fire multiple queries on one pg client, which is deprecated (removed in
  // pg@9). Each withUser() below owns its own pooled connection instead.
  //
  // LIMITed the same as /projects (PROJECT_LIST_SAFETY_CAP) - self-hosted
  // has no cap on how many projects a user can belong to, so this used to
  // pull and render every one of them on every dashboard visit. The actual
  // "Total Projects" stat is a separate COUNT(*) below rather than
  // projects.length, so it stays accurate past the cap even though the
  // rendered card list doesn't.
  const [projectsResult, projectCountResult] = await Promise.all([
    withUser(userId, ({ query }) =>
      query(
        `SELECT p.id, p.name, p.description, p.status, p.avatar_url, p.project_type, o.id AS org_id, o.name AS org_name
         FROM projects p
         JOIN organizations o ON o.id = p.organization_id
         ORDER BY p.created_at DESC
         LIMIT $1`,
        [PROJECT_LIST_SAFETY_CAP]
      )
    ),
    withUser(userId, ({ query }) => query("SELECT COUNT(*) AS total FROM projects")),
  ]);

  const projects: ProjectRow[] = projectsResult.rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    avatar_url: row.avatar_url,
    project_type: row.project_type,
    organizations: row.org_id ? { id: row.org_id, name: row.org_name } : null,
  }));
  const totalProjects = Number(projectCountResult.rows[0]?.total ?? 0);

  const projectIds = projects.map((p) => p.id);

  let totalTasks = 0;
  let completedTasks = 0;
  let totalDecisions = 0;

  if (projectIds.length > 0) {
    // Aggregated in SQL rather than fetching every task row just to count
    // and filter them in JS - this page has no cap on project count the
    // way task/memory list pages do (see their own "safety cap, not
    // pagination" comments), so a large org's dashboard load used to pull
    // every task in every one of the user's projects over the wire on
    // every visit just to show four numbers.
    const [tasksResult, decisionsResult] = await Promise.all([
      withUser(userId, ({ query }) =>
        query(
          `SELECT
             COUNT(*) FILTER (WHERE parent_task_id IS NULL) AS total,
             COUNT(*) FILTER (WHERE parent_task_id IS NULL AND status IN ('done', 'completed')) AS completed
           FROM tasks WHERE project_id = ANY($1::uuid[])`,
          [projectIds]
        )
      ),
      withUser(userId, ({ query }) =>
        query("SELECT COUNT(*) AS total FROM context_decisions WHERE project_id = ANY($1::uuid[])", [
          projectIds,
        ])
      ),
    ]);
    totalTasks = Number(tasksResult.rows[0]?.total ?? 0);
    completedTasks = Number(tasksResult.rows[0]?.completed ?? 0);
    totalDecisions = Number(decisionsResult.rows[0]?.total ?? 0);
  }

  return { projects, totalProjects, totalTasks, completedTasks, totalDecisions };
}

export default async function DashboardPage() {
  const user = await getCurrentUser();

  let projects: ProjectRow[];
  let totalProjects: number;
  let totalTasks: number;
  let completedTasks: number;
  let totalDecisions: number;

  if (hasDirectDatabase()) {
    const data = await loadDashboardDataLocal(user.id);
    projects = data.projects;
    totalProjects = data.totalProjects;
    totalTasks = data.totalTasks;
    completedTasks = data.completedTasks;
    totalDecisions = data.totalDecisions;
  } else {
    const supabase = await createClient();

    // LIMITed the same as /projects - see the matching comment in
    // loadDashboardDataLocal above. total_projects is a separate exact
    // count() so the stat card stays accurate past the cap even though the
    // rendered card list below doesn't.
    const [projectsRes, projectCountRes] = await Promise.all([
      supabase
        .from("projects")
        .select("id, name, description, status, avatar_url, project_type, organizations (id, name)")
        .order("created_at", { ascending: false })
        .limit(PROJECT_LIST_SAFETY_CAP),
      supabase.from("projects").select("id", { count: "exact", head: true }),
    ]);
    if (projectsRes.error) throw new Error(`Failed to load projects: ${projectsRes.error.message}`);
    if (projectCountRes.error) throw new Error(`Failed to load projects: ${projectCountRes.error.message}`);

    projects = (projectsRes.data ?? []) as unknown as ProjectRow[];
    totalProjects = projectCountRes.count ?? 0;
    const projectIds = projects.map((p) => p.id);

    totalTasks = 0;
    completedTasks = 0;
    totalDecisions = 0;

    if (projectIds.length > 0) {
      // count-only (head: true) queries instead of fetching every task -
      // see the matching comment in loadDashboardDataLocal above. isDone's
      // status set ('done' plus the legacy 'completed', migration 002)
      // is inlined here since PostgREST's .in() needs a literal list, not
      // a call into src/lib/work/task-board.ts's normalizeTaskStatus().
      const [totalRes, completedRes, decisionsRes] = await Promise.all([
        supabase
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .in("project_id", projectIds)
          .is("parent_task_id", null),
        supabase
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .in("project_id", projectIds)
          .is("parent_task_id", null)
          .in("status", ["done", "completed"]),
        supabase
          .from("context_decisions")
          .select("id", { count: "exact", head: true })
          .in("project_id", projectIds),
      ]);
      if (totalRes.error) throw new Error(`Failed to load tasks: ${totalRes.error.message}`);
      if (completedRes.error) throw new Error(`Failed to load tasks: ${completedRes.error.message}`);
      if (decisionsRes.error) throw new Error(`Failed to load decisions: ${decisionsRes.error.message}`);

      totalTasks = totalRes.count ?? 0;
      completedTasks = completedRes.count ?? 0;
      totalDecisions = decisionsRes.count ?? 0;
    }
  }

  const stats = {
    total_projects: totalProjects,
    totalTasks,
    completedTasks,
    totalDecisions,
  };

  return (
    <AppShell user={user}>
      <div className="container mx-auto max-w-7xl px-6 py-8">
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
              <span className="text-2xl font-bold font-mono">{stats.total_projects}</span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Tasks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-bold font-mono">{stats.totalTasks}</span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Completed Tasks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-bold font-mono">{stats.completedTasks}</span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Decisions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-bold font-mono">{stats.totalDecisions}</span>
            </CardContent>
          </Card>
        </div>

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold">Your Projects</h2>
          <div className="flex items-center gap-2">
            {totalProjects > projects.length && (
              <Button variant="outline" asChild>
                <Link href="/projects">View all {totalProjects}</Link>
              </Button>
            )}
            <Button asChild>
              <Link href="/organizations">
                <Plus className="h-4 w-4 mr-2" />
                New Project
              </Link>
            </Button>
          </div>
        </div>

        {projects.length === 0 ? (
          <div className="space-y-8">
            <div className="grid gap-4 md:grid-cols-3">
              <Card className="border-border/50">
                <CardHeader>
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                    <GitBranch className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle>Decisions</CardTitle>
                  <CardDescription>Track architectural and technical decisions</CardDescription>
                </CardHeader>
              </Card>
              <Card className="border-border/50">
                <CardHeader>
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                    <Network className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle>Context</CardTitle>
                  <CardDescription>Connect entities through relations</CardDescription>
                </CardHeader>
              </Card>
              <Card className="border-border/50">
                <CardHeader>
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                    <BrainCircuit className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle>Memory</CardTitle>
                  <CardDescription>Preserve project knowledge</CardDescription>
                </CardHeader>
              </Card>
            </div>

            <EmptyState
              icon={FolderKanban}
              title="Create your first project"
              description="Projects live inside an organization. If you don't have one yet, you'll create it on the next step."
              action={
                <Button asChild>
                  <Link href="/organizations?create=1">
                    <Plus className="h-4 w-4 mr-2" />
                    Create your first project
                  </Link>
                </Button>
              }
            />
          </div>
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
                        {PROJECT_TYPE_LABELS[project.project_type as ProjectType] ?? project.project_type}
                      </Badge>
                    )}
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
    </AppShell>
  );
}
