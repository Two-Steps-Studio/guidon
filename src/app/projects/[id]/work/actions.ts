"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { canManageProject, canWriteProject, getProjectAccess } from "@/lib/data/project-access";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { logActivity } from "@/lib/data/log-activity";
import { createNotification } from "@/lib/data/notifications";
import { notifyDiscordTaskEvent } from "@/lib/discord/notify";
import { getOrgPlanLimits, isTaskLimitReached } from "@/lib/limits";
import { resolveColumnRenumbering } from "@/lib/work/task-board";
import type { Task, TaskPriority, TaskStatus, UpdateTaskData } from "@/types/task";

export type TaskActionResult = { task: Task | null; error: string | null };
export type TaskMutationResult = { error: string | null };

export async function moveTask(
  projectId: string,
  taskId: string,
  status: TaskStatus,
  sortOrder: number
): Promise<TaskMutationResult> {
  const access = await getProjectAccess(projectId);
  if (!access || !canWriteProject(access.role)) {
    return { error: "You do not have permission to move tasks." };
  }

  let movedTaskTitle: string | null = null;

  if (hasDirectDatabase()) {
    try {
      movedTaskTitle = await withUser(access.userId, async ({ query }) => {
        // sort_order is `integer` - sortOrderForPosition's float midpoint
        // only has room to insert between two neighbours while they're
        // still more than 1 apart. Once a column has been tightly enough
        // reordered that Math.round(sortOrder) would land on an existing
        // sibling's own value, every future drop into that gap rounds to
        // the same colliding integer - the card then silently sorts by
        // compareTasks()'s tiebreak instead of where it was dropped. See
        // resolveColumnRenumbering's own comment for the full story.
        const siblings = await query(
          `SELECT id, sort_order FROM tasks
           WHERE project_id = $1 AND status = $2 AND parent_task_id IS NULL AND id <> $3
           ORDER BY sort_order ASC`,
          [projectId, status, taskId]
        );
        const plan = resolveColumnRenumbering(
          siblings.rows as { id: string; sort_order: number }[],
          taskId,
          sortOrder
        );

        if (plan) {
          // One batched UPDATE instead of one round-trip per sibling - a
          // renumbering plan spans the whole column (see
          // resolveColumnRenumbering's own comment), so a column with 50
          // tasks used to mean 50 sequential awaits for a single drag-and-drop
          // move. unnest() zips the two parallel arrays back into rows.
          await query(
            `UPDATE tasks AS t
             SET sort_order = v.sort_order
             FROM (SELECT unnest($1::uuid[]) AS id, unnest($2::int[]) AS sort_order) AS v
             WHERE t.id = v.id AND t.project_id = $3`,
            [plan.map((p) => p.id), plan.map((p) => p.sort_order), projectId]
          );
          const result = await query(
            "UPDATE tasks SET status = $1 WHERE id = $2 AND project_id = $3 RETURNING id, title",
            [status, taskId, projectId]
          );
          if (result.rows.length === 0) {
            throw new Error("This task could not be found in this project.");
          }
          return result.rows[0].title as string;
        } else {
          const result = await query(
            "UPDATE tasks SET status = $1, sort_order = $2 WHERE id = $3 AND project_id = $4 RETURNING id, title",
            [status, Math.round(sortOrder), taskId, projectId]
          );
          if (result.rows.length === 0) {
            throw new Error("This task could not be found in this project.");
          }
          return result.rows[0].title as string;
        }
      });
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Failed to move task." };
    }

    await logActivity({
      userId: access.userId,
      action: "task_status_changed",
      projectId,
      entityType: "task",
      entityId: taskId,
      details: { status },
    });
    notifyDiscordTaskEvent(
      projectId,
      access.userId,
      status === "done"
        ? { kind: "completed", taskId, title: movedTaskTitle ?? "" }
        : { kind: "status_changed", taskId, title: movedTaskTitle ?? "", status }
    );

    revalidatePath(`/projects/${projectId}/work`);
    return { error: null };
  }

  const supabase = await createClient();

  const { data: siblingsData, error: siblingsError } = await supabase
    .from("tasks")
    .select("id, sort_order")
    .eq("project_id", projectId)
    .eq("status", status)
    .is("parent_task_id", null)
    .neq("id", taskId)
    .order("sort_order", { ascending: true });
  if (siblingsError) return { error: siblingsError.message };

  const plan = resolveColumnRenumbering(
    (siblingsData ?? []) as { id: string; sort_order: number }[],
    taskId,
    sortOrder
  );

  let movedTaskTitleHosted: string | null = null;

  if (plan) {
    // One RPC round-trip instead of one UPDATE per sibling - see the pg
    // branch above and migration 033 for why. renumber_task_sort_orders
    // runs as the calling role (not SECURITY DEFINER), so tasks_update's
    // RLS policy still gates every row exactly as a direct .update() would.
    const { error: renumberError } = await supabase.rpc("renumber_task_sort_orders", {
      p_ids: plan.map((p) => p.id),
      p_sort_orders: plan.map((p) => p.sort_order),
      p_project_id: projectId,
    });
    if (renumberError) return { error: renumberError.message };
    const { data, error: statusError } = await supabase
      .from("tasks")
      .update({ status })
      .eq("id", taskId)
      .eq("project_id", projectId)
      .select("id, title");
    if (statusError) return { error: statusError.message };
    if (!data || data.length === 0) return { error: "This task could not be found in this project." };
    movedTaskTitleHosted = data[0].title;
  } else {
    const { data, error } = await supabase
      .from("tasks")
      .update({ status, sort_order: Math.round(sortOrder) })
      .eq("id", taskId)
      .eq("project_id", projectId)
      .select("id, title");
    if (error) return { error: error.message };
    if (!data || data.length === 0) return { error: "This task could not be found in this project." };
    movedTaskTitleHosted = data[0].title;
  }

  await logActivity({
    userId: access.userId,
    action: "task_status_changed",
    projectId,
    entityType: "task",
    entityId: taskId,
    details: { status },
  });
  notifyDiscordTaskEvent(
    projectId,
    access.userId,
    status === "done"
      ? { kind: "completed", taskId, title: movedTaskTitleHosted ?? "" }
      : { kind: "status_changed", taskId, title: movedTaskTitleHosted ?? "", status }
  );

  revalidatePath(`/projects/${projectId}/work`);
  return { error: null };
}

/**
 * Guidon Cloud's tasks-per-project plan cap - self-hosted has no plan
 * concept at all (hasDirectDatabase() guards every call site). Counts every
 * row in `tasks` for the project, subtasks included: a subtask is a plain
 * row in the same table with the same storage/RLS cost as a top-level task,
 * so counting only top-level tasks (as this used to) meant nesting
 * unlimited subtasks under one top-level task fully bypassed the cap -
 * createSubtask() never checked it at all.
 */
async function checkTaskLimit(
  projectId: string,
  organizationId: string
): Promise<{ error: string | null }> {
  const { planName, taskLimitPerProject } = await getOrgPlanLimits(organizationId);

  const supabase = await createClient();
  const { count } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);

  if (isTaskLimitReached(count ?? 0, taskLimitPerProject)) {
    return {
      error: `You've reached your ${planName} plan's limit of ${taskLimitPerProject} tasks per project. Upgrade your plan to raise this limit.`,
    };
  }
  return { error: null };
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
  }
): Promise<TaskActionResult> {
  const access = await getProjectAccess(projectId);
  // Mirrors tasks_insert (001): owner/admin/developer.
  if (!access || !canWriteProject(access.role)) {
    return { task: null, error: "You do not have permission to create tasks." };
  }

  if (!hasDirectDatabase()) {
    const limit = await checkTaskLimit(projectId, access.project.organization_id);
    if (limit.error) return { task: null, error: limit.error };
  }

  if (!input.title.trim()) {
    return { task: null, error: "Title is required." };
  }

  const description = input.description.trim() || null;
  const assigneeId = input.assigneeId || null;
  const dueDate = input.dueDate ? new Date(input.dueDate).toISOString() : null;

  if (hasDirectDatabase()) {
    try {
      const result = await withUser(access.userId, ({ query }) =>
        query(
          `INSERT INTO tasks (project_id, title, description, status, priority, assignee_id, due_date, tags, created_by, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING *`,
          [
            projectId,
            input.title.trim(),
            description,
            input.status,
            input.priority,
            assigneeId,
            dueDate,
            [],
            access.userId,
            input.sortOrder,
          ]
        )
      );
      await logActivity({
        userId: access.userId,
        action: "task_created",
        projectId,
        entityType: "task",
        entityId: result.rows[0].id,
        details: { title: input.title.trim() },
      });
      notifyDiscordTaskEvent(projectId, access.userId, {
        kind: "created",
        taskId: result.rows[0].id,
        title: input.title.trim(),
      });
      notifyTaskAssignment(projectId, access.userId, result.rows[0] as Task, { assignee_id: assigneeId });
      revalidatePath(`/projects/${projectId}/work`);
      return { task: result.rows[0] as Task, error: null };
    } catch (error) {
      return { task: null, error: error instanceof Error ? error.message : "Failed to create task." };
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      project_id: projectId,
      title: input.title.trim(),
      description,
      status: input.status,
      priority: input.priority,
      assignee_id: assigneeId,
      due_date: dueDate,
      tags: [],
      created_by: access.userId,
      sort_order: input.sortOrder,
    })
    .select()
    .single();

  if (error) return { task: null, error: error.message };

  await logActivity({
    userId: access.userId,
    action: "task_created",
    projectId,
    entityType: "task",
    entityId: data.id,
    details: { title: input.title.trim() },
  });
  notifyDiscordTaskEvent(projectId, access.userId, { kind: "created", taskId: data.id, title: input.title.trim() });
  notifyTaskAssignment(projectId, access.userId, data as Task, { assignee_id: assigneeId });

  revalidatePath(`/projects/${projectId}/work`);
  return { task: data as Task, error: null };
}

/**
 * Nullable, unlike UpdateTaskData: the dialog sends null to explicitly clear
 * a field (an empty due date means "remove the due date", not "leave alone").
 */
type TaskPatch = Omit<UpdateTaskData, "id" | "description" | "assignee_id" | "due_date"> & {
  description?: string | null;
  assignee_id?: string | null;
  due_date?: string | null;
};

/**
 * `patch` is caller-constructed TypeScript, not raw request input, but this
 * whitelist is what keeps a raw `SET ${col} = $n` build safe regardless -
 * only these column names can ever reach the query string, no matter what
 * TaskPatch's shape does in the future.
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

function buildTaskUpdateClause(patch: TaskPatch): { setClause: string; values: unknown[] } {
  const entries = Object.entries(patch).filter(([key]) =>
    (TASK_PATCH_COLUMNS as readonly string[]).includes(key)
  );
  const setClause = entries.map(([key], i) => `${key} = $${i + 1}`).join(", ");
  const values = entries.map(([, value]) => value);
  return { setClause, values };
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
  patch: TaskPatch
): Promise<TaskActionResult> {
  const access = await getProjectAccess(projectId);
  // Mirrors tasks_update (001): owner/admin/developer.
  if (!access || !canWriteProject(access.role)) {
    return { task: null, error: "You do not have permission to edit this task." };
  }

  if (hasDirectDatabase()) {
    const { setClause, values } = buildTaskUpdateClause(patch);
    if (!setClause) return { task: null, error: "Nothing to update." };

    try {
      const result = await withUser(access.userId, ({ query }) =>
        query(
          `UPDATE tasks SET ${setClause} WHERE id = $${values.length + 1} AND project_id = $${values.length + 2} RETURNING *`,
          [...values, taskId, projectId]
        )
      );
      if (result.rows.length === 0) {
        return { task: null, error: "This task could not be found in this project." };
      }
      await logActivity({
        userId: access.userId,
        action: "task_updated",
        projectId,
        entityType: "task",
        entityId: taskId,
      });
      notifyTaskAssignment(projectId, access.userId, result.rows[0] as Task, patch);
      revalidatePath(`/projects/${projectId}/work`);
      return { task: result.rows[0] as Task, error: null };
    } catch (error) {
      return { task: null, error: error instanceof Error ? error.message : "Failed to update task." };
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .update(patch)
    .eq("id", taskId)
    .eq("project_id", projectId)
    .select()
    .maybeSingle();

  if (error) return { task: null, error: error.message };
  if (!data) return { task: null, error: "This task could not be found in this project." };

  await logActivity({
    userId: access.userId,
    action: "task_updated",
    projectId,
    entityType: "task",
    entityId: taskId,
  });
  notifyTaskAssignment(projectId, access.userId, data as Task, patch);

  revalidatePath(`/projects/${projectId}/work`);
  return { task: data as Task, error: null };
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
    return { task: null, error: "You do not have permission to create subtasks." };
  }

  if (!hasDirectDatabase()) {
    const limit = await checkTaskLimit(projectId, access.project.organization_id);
    if (limit.error) return { task: null, error: limit.error };
  }

  if (!title.trim()) {
    return { task: null, error: "Title is required." };
  }

  if (hasDirectDatabase()) {
    try {
      const result = await withUser(access.userId, async ({ query }) => {
        // parent_task_id only FKs to tasks(id) - nothing at the DB level
        // requires it to be a task in this same project. Without this
        // check, a caller with write access to projectId could create a
        // subtask whose stated parent is actually a task in a completely
        // different project (any id they can name), an inconsistent
        // cross-project reference nothing else in the UI expects.
        const parent = await query("SELECT project_id FROM tasks WHERE id = $1", [parentTaskId]);
        if (parent.rows[0]?.project_id !== projectId) {
          throw new Error("Parent task not found in this project.");
        }

        return query(
          `INSERT INTO tasks (project_id, parent_task_id, title, status, priority, tags, created_by)
           VALUES ($1, $2, $3, 'todo', 'medium', $4, $5)
           RETURNING *`,
          [projectId, parentTaskId, title.trim(), [], access.userId]
        );
      });
      await logActivity({
        userId: access.userId,
        action: "task_created",
        projectId,
        entityType: "task",
        entityId: result.rows[0].id,
        details: { title: title.trim() },
      });
      revalidatePath(`/projects/${projectId}/work`);
      return { task: result.rows[0] as Task, error: null };
    } catch (error) {
      return { task: null, error: error instanceof Error ? error.message : "Failed to create subtask." };
    }
  }

  const supabase = await createClient();

  // Same reasoning as the direct-Postgres branch above.
  const { data: parentTask } = await supabase.from("tasks").select("project_id").eq("id", parentTaskId).maybeSingle();
  if (parentTask?.project_id !== projectId) {
    return { task: null, error: "Parent task not found in this project." };
  }

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      project_id: projectId,
      parent_task_id: parentTaskId,
      title: title.trim(),
      status: "todo",
      priority: "medium",
      tags: [],
      created_by: access.userId,
    })
    .select()
    .single();

  if (error) return { task: null, error: error.message };

  await logActivity({
    userId: access.userId,
    action: "task_created",
    projectId,
    entityType: "task",
    entityId: data.id,
    details: { title: title.trim() },
  });

  revalidatePath(`/projects/${projectId}/work`);
  return { task: data as Task, error: null };
}

export async function deleteTask(
  projectId: string,
  taskId: string
): Promise<TaskMutationResult> {
  const access = await getProjectAccess(projectId);
  // Mirrors tasks_delete (001): owner/admin only.
  if (!access || !canManageProject(access.role)) {
    return { error: "You do not have permission to delete this task." };
  }

  if (hasDirectDatabase()) {
    try {
      // Scoped to project_id, same reasoning as updateTask's own rowcount
      // check above: without it this deletes ANY task id passed in (a task
      // from a different project this caller might manage under a different
      // role), and without RETURNING, a mismatched id came back as a silent
      // `{ error: null }` "success" with zero rows actually removed - the
      // activity log then recorded a "task_deleted" entry for a task that
      // still exists, under the wrong project.
      const result = await withUser(access.userId, ({ query }) =>
        query("DELETE FROM tasks WHERE id = $1 AND project_id = $2 RETURNING id", [taskId, projectId])
      );
      if (result.rows.length === 0) {
        return { error: "This task could not be found in this project." };
      }
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Failed to delete this task." };
    }

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

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .delete()
    .eq("id", taskId)
    .eq("project_id", projectId)
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "This task could not be found in this project." };
  }

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
