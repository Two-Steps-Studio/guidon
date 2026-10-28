import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentUser } from "@/lib/data/current-user";
import { dataClient } from "@/lib/data-client";
import { resolveBoardColumns, resolvePriorities } from "@/lib/work/task-board";
import { getWorkflowOverridesFor } from "@/lib/data/workflow";
import type { Task } from "@/types/task";
import { MyTasksList, type MyTasksProject } from "./my-tasks-list";
import { QuickAdd, type QuickAddProject } from "./quick-add";

export const metadata: Metadata = { title: "My tasks" };

/** Open tasks assigned to one person rarely come close; the cap keeps a runaway query bounded. */
const TASK_LIMIT = 500;

/**
 * Everything assigned to the signed-in user across every project they can
 * see (RLS on tasks/projects decides that), grouped by due date, with the
 * status changeable inline through the board's own moveTask action.
 */
export default async function MyTasksPage() {
  const [user, t, tWork] = await Promise.all([getCurrentUser(), getTranslations("myTasks"), getTranslations("work")]);
  const db = dataClient(user.id);

  const { data: tasks, error } = await db
    .from<Task>("tasks")
    .select("*")
    .eq("assignee_id", user.id)
    .eq("is_done", false)
    .order("due_date", { ascending: true })
    .limit(TASK_LIMIT);
  if (error) throw new Error(`Failed to load your tasks: ${error.message}`);

  // Quick add offers every active project the user can create tasks in
  // (owner/admin/developer, as tasks_insert); createTask checks it again.
  const { data: memberships } = await db
    .from<{ project_id: string }>("project_members")
    .select("project_id")
    .eq("user_id", user.id)
    .in("role", ["owner", "admin", "developer"]);
  const writableIds = (memberships ?? []).map((row) => row.project_id);
  const { data: writable } = writableIds.length
    ? await db
        .from<QuickAddProject & { status: string }>("projects")
        .select("id, name, color, status")
        .in("id", writableIds)
        .eq("status", "active")
        .order("name", { ascending: true })
    : { data: [] as (QuickAddProject & { status: string })[] };
  const quickAddProjects = (writable ?? []).map(({ id, name, color }) => ({ id, name, color }));

  const projectIds = [...new Set(tasks.map((task) => task.project_id))];
  const [projectsResult, workflows] = await Promise.all([
    projectIds.length
      ? db
          .from<{ id: string; name: string; color: string | null; ai_enabled: boolean }>("projects")
          .select("id, name, color, ai_enabled")
          .in("id", projectIds)
      : Promise.resolve({ data: [], error: null }),
    getWorkflowOverridesFor(user.id, projectIds),
  ]);
  if (projectsResult.error) throw new Error(`Failed to load projects: ${projectsResult.error.message}`);

  const projects: Record<string, MyTasksProject> = {};
  for (const project of projectsResult.data ?? []) {
    const workflow = workflows.get(project.id) ?? { columns: [], priorities: [] };
    const resolved = resolveBoardColumns(workflow.columns, (status) => ({
      label: tWork("status", { status }),
      hint: tWork("statusHint", { status }),
    }));
    // Same rule as the Work board: no "AI Working" on an AI-off project (the
    // list still shows it for a task already sitting there - my-tasks-list).
    const columns = project.ai_enabled ? resolved : resolved.filter((column) => column.status !== "ai_working");
    const priorities = resolvePriorities(workflow.priorities, (priority) => tWork("priority", { priority }));
    projects[project.id] = { id: project.id, name: project.name, color: project.color, columns, priorities };
  }

  return (
    <AppShell user={user}>
      <div className="container mx-auto max-w-4xl px-6 py-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
            <p className="text-sm text-muted-foreground">{t("subtitle", { count: tasks.length })}</p>
          </div>
          <QuickAdd userId={user.id} projects={quickAddProjects} />
        </div>
        {/* Keyed by the task set: the list keeps its tasks in state, so a task
            added by Quick add (router.refresh) needs a fresh mount to appear. */}
        <MyTasksList
          key={tasks.map((task) => task.id).join(",")}
          initialTasks={tasks.filter((task) => projects[task.project_id])}
          projects={projects}
        />
      </div>
    </AppShell>
  );
}
