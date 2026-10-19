import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentUser } from "@/lib/data/current-user";
import { dataClient } from "@/lib/data-client";
import { resolveBoardColumns, type BoardColumnOverride } from "@/lib/work/task-board";
import type { Task } from "@/types/task";
import { MyTasksList, type MyTasksProject } from "./my-tasks-list";

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
    .neq("status", "done")
    .order("due_date", { ascending: true })
    .limit(TASK_LIMIT);
  if (error) throw new Error(`Failed to load your tasks: ${error.message}`);

  const projectIds = [...new Set(tasks.map((task) => task.project_id))];
  const [projectsResult, overridesResult] = projectIds.length
    ? await Promise.all([
        db
          .from<{ id: string; name: string; color: string | null; ai_enabled: boolean }>("projects")
          .select("id, name, color, ai_enabled")
          .in("id", projectIds),
        db
          .from<BoardColumnOverride & { project_id: string }>("project_board_columns")
          .select("project_id, status, label, sort_order, hidden")
          .in("project_id", projectIds),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (projectsResult.error) throw new Error(`Failed to load projects: ${projectsResult.error.message}`);
  if (overridesResult.error) throw new Error(`Failed to load board columns: ${overridesResult.error.message}`);

  const projects: Record<string, MyTasksProject> = {};
  for (const project of projectsResult.data) {
    const overrides = overridesResult.data.filter((row) => row.project_id === project.id);
    const resolved = resolveBoardColumns(overrides, (status) => ({
      label: tWork("status", { status }),
      hint: tWork("statusHint", { status }),
    }));
    // Same rule as the Work board: no "AI Working" on an AI-off project (the
    // list still shows it for a task already sitting there - my-tasks-list).
    const columns = project.ai_enabled ? resolved : resolved.filter((column) => column.status !== "ai_working");
    projects[project.id] = { id: project.id, name: project.name, color: project.color, columns };
  }

  return (
    <AppShell user={user}>
      <div className="container mx-auto max-w-4xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle", { count: tasks.length })}</p>
        </div>
        <MyTasksList initialTasks={tasks.filter((task) => projects[task.project_id])} projects={projects} />
      </div>
    </AppShell>
  );
}
