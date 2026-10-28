"use server";

import { revalidatePath } from "next/cache";
import { canManageProject, canWriteProject, getProjectAccess } from "@/lib/data/project-access";
import { dataClient } from "@/lib/data-client";
import { logActivity } from "@/lib/data/log-activity";
import { createNotification } from "@/lib/data/notifications";
import { emitTaskEvent } from "@/lib/events/task-events";
import { hostedTaskLimitError } from "@/lib/limits";
import { resolveColumnRenumbering } from "@/lib/work/task-board";
import { ensureNextOccurrence } from "@/lib/work/recurrence";
import { normalizeRecurrence } from "@/lib/work/recurrence-core";
import type { Task, TaskPriority, TaskStatus, UpdateTaskData } from "@/types/task";
import { tr } from "@/lib/i18n/server-errors";

/** `created`: a repeating task's next occurrence (and its subtasks), made because this finished it. */
export type TaskActionResult = { task: Task | null; error: string | null; created?: Task[]; code?: "conflict" | "version_unavailable" };
export type TaskMutationResult = { error: string | null; created?: Task[] };

export async function moveTask(
  projectId: string,
  taskId: string,
  status: TaskStatus,
  sortOrder: number
): Promise<TaskMutationResult> {
  const access = await getProjectAccess(projectId);
  if (!access || !canWriteProject(access.role)) {
    return { error: await tr("You do not have permission to move tasks.") };
  }

  const db = dataClient(access.userId);

  // sort_order is `integer` - sortOrderForPosition's float midpoint only has
  // room to insert between two neighbours while they're still more than 1
  // apart. Once a column has been tightly enough reordered that
  // Math.round(sortOrder) would land on an existing sibling's own value,
  // every future drop into that gap rounds to the same colliding integer -
  // the card then silently sorts by compareTasks()'s tiebreak instead of
  // where it was dropped. See resolveColumnRenumbering's own comment.
  const { data: siblings, error: siblingsError } = await db
    .from<{ id: string; sort_order: number }>("tasks")
    .select("id, sort_order")
    .eq("project_id", projectId)
    .eq("status", status)
    .is("parent_task_id", null)
    .neq("id", taskId)
    .order("sort_order", { ascending: true });
  if (siblingsError) return { error: siblingsError.message };

  const plan = resolveColumnRenumbering(siblings, taskId, sortOrder);

  if (plan) {
    // One round-trip for the whole column instead of one UPDATE per sibling
    // (migration 033). renumber_task_sort_orders runs as the caller, not
    // SECURITY DEFINER, so tasks_update's RLS still gates every row. It and
    // the status update below are two statements - a failure in between
    // leaves the column renumbered but the card unmoved, which is harmless.
    const { error: renumberError } = await db.rpc("renumber_task_sort_orders", {
      p_ids: plan.map((p) => p.id),
      p_sort_orders: plan.map((p) => p.sort_order),
      p_project_id: projectId,
    });
    if (renumberError) return { error: renumberError.message };
  }

  const { data: moved, error } = await db
    .from<{ id: string; title: string; is_done: boolean }>("tasks")
    .update(plan ? { status } : { status, sort_order: Math.round(sortOrder) })
    .eq("id", taskId)
    .eq("project_id", projectId)
    .select("id, title, is_done")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!moved) return { error: await tr("This task could not be found in this project.") };

  await logActivity({
    userId: access.userId,
    action: "task_status_changed",
    projectId,
    entityType: "task",
    entityId: taskId,
    details: { status },
  });
  // Here and not only in emitTaskEvent's background run, so the board gets
  // the next occurrence of a repeating task back right away.
  const created = moved.is_done ? await ensureNextOccurrence(db, projectId, access.userId, taskId) : [];
  emitTaskEvent(
    projectId,
    access.userId,
    // is_done, not status === "done": a project's own done column finishes too.
    moved.is_done
      ? { kind: "completed", taskId, title: moved.title }
      : { kind: "status_changed", taskId, title: moved.title, status }
  );

  revalidatePath(`/projects/${projectId}/work`);
  return { error: null, created };
}

export async function createTask(
  projectId: string,
  input: {
    title: string;
    description: string;
    status: TaskStatus;
    priority: TaskPriority;
    assigneeId: string;
    dueDate: string;
    sortOrder: number;
    /** Labels, as typed or picked from the project's presets. */
    tags?: string[];
  }
): Promise<TaskActionResult> {
  const access = await getProjectAccess(projectId);
  // Mirrors tasks_insert (001): owner/admin/developer.
  if (!access || !canWriteProject(access.role)) {
    return { task: null, error: await tr("You do not have permission to create tasks.") };
  }

  const limitError = await hostedTaskLimitError(projectId, access.project.organization_id);
  if (limitError) return { task: null, error: limitError };

  if (!input.title.trim()) {
    return { task: null, error: await tr("Title is required.") };
  }

  const description = input.description.trim() || null;
  const assigneeId = input.assigneeId || null;
  const dueDate = input.dueDate ? new Date(input.dueDate).toISOString() : null;
  // Trimmed, empty ones dropped, case-insensitive duplicates removed.
  const tags = (Array.isArray(input.tags) ? input.tags : [])
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.trim().slice(0, 50))
    .filter((tag, index, all) => tag && all.findIndex((other) => other.toLowerCase() === tag.toLowerCase()) === index)
    .slice(0, 30);

  const { data: task, error } = await dataClient(access.userId)
    .from<Task>("tasks")
    .insert({
      project_id: projectId,
      title: input.title.trim(),
      description,
      status: input.status,
      priority: input.priority,
      assignee_id: assigneeId,
      due_date: dueDate,
      tags,
      created_by: access.userId,
      sort_order: input.sortOrder,
    })
    .select("*")
    .single();

  if (error || !task) return { task: null, error: error?.message ?? "Failed to create task." };

  await logActivity({
    userId: access.userId,
    action: "task_created",
    projectId,
    entityType: "task",
    entityId: task.id,
    details: { title: input.title.trim() },
  });
  emitTaskEvent(projectId, access.userId, { kind: "created", taskId: task.id, title: input.title.trim() });
  notifyTaskAssignment(projectId, access.userId, task, { assignee_id: assigneeId });

  revalidatePath(`/projects/${projectId}/work`);
  return { task, error: null };
}

/**
 * Nullable, unlike UpdateTaskData: the dialog sends null to explicitly clear
 * a field (an empty due date means "remove the due date", not "leave alone").
 */
type TaskPatch = Omit<UpdateTaskData, "id" | "description" | "assignee_id" | "due_date"> & {
  description?: string | null;
  assignee_id?: string | null;
  due_date?: string | null;
  /** null = stop repeating; recurrence_interval goes with it (migration 063). */
  recurrence_rule?: string | null;
  recurrence_interval?: number | null;
};

/**
 * The columns a task edit may touch. `patch` arrives from the browser (this
 * is a Server Action), so anything else - project_id, created_by, id - is
 * dropped here rather than trusted to the column GRANTs alone.
 */
const TASK_PATCH_COLUMNS = [
  "title",
  "description",
  "status",
  "priority",
  "tags",
  "due_date",
  "progress_percent",
  "assignee_id",
  "estimated_hours",
  "actual_hours",
  "sort_order",
  "decision_id",
] as const;

function pickTaskPatch(patch: TaskPatch): Record<string, unknown> {
  const columns: Record<string, unknown> = Object.fromEntries(
    Object.entries(patch).filter(([key]) => (TASK_PATCH_COLUMNS as readonly string[]).includes(key))
  );
  // Rule and interval are set together, and only to a valid pair - or both
  // cleared (the column CHECK in 063 wants exactly that).
  if ("recurrence_rule" in patch) {
    Object.assign(
      columns,
      normalizeRecurrence(patch.recurrence_rule, patch.recurrence_interval) ?? {
        recurrence_rule: null,
        recurrence_interval: null,
      }
    );
  }
  return columns;
}

/**
 * Fires only when this patch actually sets a new assignee, and never
 * notifies someone for assigning a task to themselves.
 */
function notifyTaskAssignment(projectId: string, actorId: string, task: Task, patch: TaskPatch) {
  if (!patch.assignee_id || patch.assignee_id === actorId) return;
  createNotification({
    userId: patch.assignee_id,
    projectId,
    type: "task_assigned",
    title: `Assigned to you: ${task.title}`,
    link: `/projects/${projectId}/work?openTask=${task.id}`,
  });
}

export async function updateTask(
  projectId: string,
  taskId: string,
  patch: TaskPatch,
  expectedRevision?: number
): Promise<TaskActionResult> {
  const access = await getProjectAccess(projectId);
  // Mirrors tasks_update (001): owner/admin/developer.
  if (!access || !canWriteProject(access.role)) {
    return { task: null, error: await tr("You do not have permission to edit this task.") };
  }
  if (expectedRevision !== undefined && (!Number.isInteger(expectedRevision) || expectedRevision < 0 || expectedRevision >= 2147483647)) {
    return { task: null, code: "version_unavailable", error: await tr("The task version is unavailable. Download your edits, then reload after the database is updated.") };
  }

  const columns = pickTaskPatch(patch);
  if (Object.keys(columns).length === 0) return { task: null, error: await tr("Nothing to update.") };

  const db = dataClient(access.userId);
  // Whether this edit finishes the task (or otherwise moves it) - for the
  // same events a move on the board sends.
  const { data: before } = "status" in columns
    ? await db.from<{ status: string; is_done: boolean }>("tasks").select("status, is_done").eq("id", taskId).eq("project_id", projectId).maybeSingle()
    : { data: null };

  let mutation = db
    .from<Task>("tasks")
    .update(columns)
    .eq("id", taskId)
    .eq("project_id", projectId);
  if (expectedRevision !== undefined) mutation = mutation.eq("revision", expectedRevision);
  const { data: task, error } = await mutation.select("*").maybeSingle();

  if (error) return { task: null, error: error.message };
  if (!task && expectedRevision !== undefined) return { task: null, code: "conflict", error: await tr("This task changed or is no longer available. Your edits were not saved. Download them before reloading.") };
  if (!task) return { task: null, error: await tr("This task could not be found in this project.") };

  await logActivity({
    userId: access.userId,
    action: "task_updated",
    projectId,
    entityType: "task",
    entityId: taskId,
  });
  notifyTaskAssignment(projectId, access.userId, task, patch);

  let created: Task[] = [];
  if (before && before.status !== task.status) {
    const finished = Boolean(task.is_done) && !before.is_done;
    if (finished) created = await ensureNextOccurrence(db, projectId, access.userId, taskId);
    emitTaskEvent(
      projectId,
      access.userId,
      finished
        ? { kind: "completed", taskId, title: task.title }
        : { kind: "status_changed", taskId, title: task.title, status: task.status }
    );
  }

  revalidatePath(`/projects/${projectId}/work`);
  return { task, error: null, created };
}

export async function createSubtask(
  projectId: string,
  parentTaskId: string,
  title: string
): Promise<TaskActionResult> {
  const access = await getProjectAccess(projectId);
  // A subtask is a plain row in `tasks`, so it is gated by the same policy
  // as any other task: tasks_insert (001), owner/admin/developer.
  if (!access || !canWriteProject(access.role)) {
    return { task: null, error: await tr("You do not have permission to create subtasks.") };
  }

  const limitError = await hostedTaskLimitError(projectId, access.project.organization_id);
  if (limitError) return { task: null, error: limitError };

  if (!title.trim()) {
    return { task: null, error: await tr("Title is required.") };
  }

  const db = dataClient(access.userId);

  // parent_task_id only FKs to tasks(id) - nothing at the DB level requires
  // it to be a task in this same project. Without this check, a caller with
  // write access to projectId could create a subtask whose stated parent is
  // a task in a completely different project (any id they can name).
  const { data: parent } = await db
    .from<{ id: string }>("tasks")
    .select("id")
    .eq("id", parentTaskId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!parent) return { task: null, error: await tr("Parent task not found in this project.") };

  const { data: task, error } = await db
    .from<Task>("tasks")
    .insert({
      project_id: projectId,
      parent_task_id: parentTaskId,
      title: title.trim(),
      status: "todo",
      priority: "medium",
      tags: [],
      created_by: access.userId,
    })
    .select("*")
    .single();

  if (error || !task) return { task: null, error: error?.message ?? "Failed to create subtask." };

  await logActivity({
    userId: access.userId,
    action: "task_created",
    projectId,
    entityType: "task",
    entityId: task.id,
    details: { title: title.trim() },
  });

  revalidatePath(`/projects/${projectId}/work`);
  return { task, error: null };
}

export async function deleteTask(
  projectId: string,
  taskId: string
): Promise<TaskMutationResult> {
  const access = await getProjectAccess(projectId);
  // Mirrors tasks_delete (001): owner/admin only.
  if (!access || !canManageProject(access.role)) {
    return { error: await tr("You do not have permission to delete this task.") };
  }

  // Scoped to project_id with a row check: without it a mismatched id (a
  // task in another project, or one RLS hides) came back as a silent
  // "success" and the activity log recorded a deletion that never happened.
  const { data: deleted, error } = await dataClient(access.userId)
    .from("tasks")
    .delete()
    .eq("id", taskId)
    .eq("project_id", projectId)
    .select("id");

  if (error) return { error: error.message };
  if (deleted.length === 0) return { error: await tr("This task could not be found in this project.") };

  await logActivity({
    userId: access.userId,
    action: "task_deleted",
    projectId,
    entityType: "task",
    entityId: taskId,
  });

  revalidatePath(`/projects/${projectId}/work`);
  return { error: null };
}
