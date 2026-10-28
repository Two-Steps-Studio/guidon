"use server";

import { revalidatePath } from "next/cache";
import { canManageProject, canWriteProject, getProjectAccess } from "@/lib/data/project-access";
import { isValidUuid } from "@/lib/api/validate-id";
import { dataClient, serviceDataClient } from "@/lib/data-client";
import { logActivity } from "@/lib/data/log-activity";
import { hasDirectDatabase } from "@/lib/db/pool";
import { getOrgPlanLimits } from "@/lib/limits";
import { WORKFLOW_KEY_RE } from "@/lib/work/task-board";
import { MAX_IMPORT_TASKS, type ResolvedImportTask } from "@/lib/work/task-import";
import type { Task } from "@/types/task";
import { tr } from "@/lib/i18n/server-errors";

const SORT_STEP = 1000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Adds tasks parsed and mapped in the browser (lib/work/task-import.ts) to
 * a project's board - added, not replacing anything (a .guidon file is the
 * way to replace a board). Everything is re-checked here: the browser only
 * proposes. Statuses/priorities must be keys the project has (the database
 * checks, migration 060); an assignee must be a project member (validate_task).
 */
export async function importTasks(
  projectId: string,
  tasks: ResolvedImportTask[]
): Promise<{ error: string | null; count: number; tasks: Task[] }> {
  const access = await getProjectAccess(projectId);
  if (!access || !canWriteProject(access.role)) return { error: await tr("You do not have permission to create tasks."), count: 0, tasks: [] };
  if (!Array.isArray(tasks) || tasks.length === 0) return { error: await tr("Nothing to import."), count: 0, tasks: [] };
  if (tasks.length > MAX_IMPORT_TASKS) return { error: `At most ${MAX_IMPORT_TASKS} tasks per import.`, count: 0, tasks: [] };

  for (const task of tasks) {
    if (typeof task.title !== "string" || !task.title.trim()) return { error: await tr("Every task needs a title."), count: 0, tasks: [] };
    if (!WORKFLOW_KEY_RE.test(task.status) || !WORKFLOW_KEY_RE.test(task.priority)) return { error: await tr("Invalid status or priority."), count: 0, tasks: [] };
    if (task.dueDate !== null && !DAY_RE.test(task.dueDate)) return { error: await tr("Invalid due date."), count: 0, tasks: [] };
  }

  // Guidon Cloud's per-project task cap, for the whole batch at once.
  if (!hasDirectDatabase()) {
    const [{ planName, taskLimitPerProject }, { data: current }] = await Promise.all([
      getOrgPlanLimits(access.project.organization_id),
      serviceDataClient().from("tasks").eq("project_id", projectId).count(),
    ]);
    if (taskLimitPerProject !== null && current + tasks.length > taskLimitPerProject) {
      return {
        error: `This would make ${current + tasks.length} tasks - over your ${planName} plan's limit of ${taskLimitPerProject} per project.`,
        count: 0,
        tasks: [],
      };
    }
  }

  const db = dataClient(access.userId);
  const { data: members } = await db.from<{ user_id: string }>("project_members").select("user_id").eq("project_id", projectId);
  const memberIds = new Set((members ?? []).map((m) => m.user_id));

  // Each column's imported cards go after what's already there, in file order.
  const { data: existing } = await db
    .from<{ status: string; sort_order: number | null }>("tasks")
    .select("status, sort_order")
    .eq("project_id", projectId)
    .is("parent_task_id", null);
  const nextOrder = new Map<string, number>();
  for (const row of existing ?? []) nextOrder.set(row.status, Math.max(nextOrder.get(row.status) ?? 0, row.sort_order ?? 0));

  const rows = tasks.map((task) => {
    const order = (nextOrder.get(task.status) ?? 0) + SORT_STEP;
    nextOrder.set(task.status, order);
    return {
      project_id: projectId,
      title: task.title.trim().slice(0, 500),
      description: task.description?.trim() || null,
      status: task.status,
      priority: task.priority,
      tags: (task.tags ?? []).map((tag) => String(tag).trim().slice(0, 50)).filter(Boolean).slice(0, 30),
      due_date: task.dueDate ? new Date(`${task.dueDate}T00:00:00.000Z`).toISOString() : null,
      assignee_id: task.assigneeId && memberIds.has(task.assigneeId) ? task.assigneeId : null,
      sort_order: order,
      created_by: access.userId,
    };
  });

  // In chunks: one statement each, so a bad row fails its chunk with the
  // database's message instead of the whole import half-written row by row.
  // The created rows go back to the board, which keeps its own task state.
  const created: Task[] = [];
  for (let i = 0; i < rows.length; i += 200) {
    const { data, error } = await db.from<Task>("tasks").insert(rows.slice(i, i + 200)).select("*");
    if (error) {
      if (created.length) revalidatePath(`/projects/${projectId}/work`);
      const count = created.length;
      return { error: count ? `Imported ${count}, then stopped: ${error.message}` : error.message, count, tasks: created };
    }
    created.push(...data);
  }
  const count = created.length;

  await logActivity({
    userId: access.userId,
    action: "tasks_imported",
    projectId,
    entityType: "task",
    // The ids make the import auditable and undoable (undoImport below).
    details: { count, task_ids: created.map((task) => task.id) },
  });
  revalidatePath(`/projects/${projectId}/work`);
  return { error: null, count, tasks: created };
}

/**
 * Takes an import back: deletes the tasks it created that nobody has touched
 * since (revision 0, migration 086) - a task someone already edited, moved
 * or commented on stays, and is reported as kept. Owners and admins only,
 * like any task deletion (tasks_delete, 001).
 */
export async function undoImport(
  projectId: string,
  taskIds: string[]
): Promise<{ error: string | null; removed: string[]; kept: number }> {
  const access = await getProjectAccess(projectId);
  if (!access || !canManageProject(access.role)) {
    return { error: await tr("Only project owners and admins can undo an import."), removed: [], kept: 0 };
  }
  const ids = Array.isArray(taskIds) ? [...new Set(taskIds.filter((id) => typeof id === "string" && isValidUuid(id)))] : [];
  if (ids.length === 0 || ids.length > MAX_IMPORT_TASKS) return { error: await tr("Nothing to import."), removed: [], kept: 0 };

  const db = dataClient(access.userId);
  const removed: string[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db
      .from<{ id: string }>("tasks")
      .delete()
      .eq("project_id", projectId)
      .in("id", ids.slice(i, i + 200))
      .eq("revision", 0)
      .select("id");
    if (error) return { error: error.message, removed, kept: ids.length - removed.length };
    removed.push(...data.map((row) => row.id));
  }

  if (removed.length) {
    await logActivity({
      userId: access.userId,
      action: "tasks_import_undone",
      projectId,
      entityType: "task",
      details: { count: removed.length, task_ids: removed, kept: ids.length - removed.length },
    });
    revalidatePath(`/projects/${projectId}/work`);
  }
  return { error: null, removed, kept: ids.length - removed.length };
}
