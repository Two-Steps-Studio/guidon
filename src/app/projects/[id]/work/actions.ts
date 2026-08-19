"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import {
  canCommentOnProject,
  canManageProject,
  canWriteProject,
  getProjectAccess,
} from "@/lib/data/project-access";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import type { AttemptOutcome, Task, TaskAttempt, TaskPriority, TaskStatus, UpdateTaskData } from "@/types/task";

export type TaskActionResult = { task: Task | null; error: string | null };
export type TaskMutationResult = { error: string | null };

export type TaskComment = {
  id: string;
  task_id: string;
  author_id: string;
  content: string;
  created_at: string;
};

export async function loadComments(
  projectId: string,
  taskId: string
): Promise<{ comments: TaskComment[]; error: string | null }> {
  const access = await getProjectAccess(projectId);
  if (!access) return { comments: [], error: "You do not have access to this project." };

  if (hasDirectDatabase()) {
    try {
      const result = await withUser(access.userId, ({ query }) =>
        query(
          "SELECT id, task_id, author_id, content, created_at FROM task_comments WHERE task_id = $1 ORDER BY created_at ASC",
          [taskId]
        )
      );
      return { comments: result.rows, error: null };
    } catch (error) {
      return { comments: [], error: error instanceof Error ? error.message : "Failed to load comments." };
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("task_comments")
    .select("id, task_id, author_id, content, created_at")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });

  if (error) return { comments: [], error: error.message };
  return { comments: (data ?? []) as TaskComment[], error: null };
}

export async function postComment(
  projectId: string,
  taskId: string,
  content: string
): Promise<{ comment: TaskComment | null; error: string | null }> {
  const access = await getProjectAccess(projectId);
  // Mirrors task_comments_insert (001): owner/admin/developer/tester.
  if (!access || !canCommentOnProject(access.role)) {
    return { comment: null, error: "You do not have permission to comment on this task." };
  }
  if (!content.trim()) {
    return { comment: null, error: "Comment cannot be empty." };
  }

  if (hasDirectDatabase()) {
    try {
      const result = await withUser(access.userId, ({ query }) =>
        query(
          `INSERT INTO task_comments (task_id, author_id, content)
           VALUES ($1, $2, $3)
           RETURNING id, task_id, author_id, content, created_at`,
          [taskId, access.userId, content.trim()]
        )
      );
      return { comment: result.rows[0] as TaskComment, error: null };
    } catch (error) {
      return { comment: null, error: error instanceof Error ? error.message : "Failed to post comment." };
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("task_comments")
    .insert({ task_id: taskId, author_id: access.userId, content: content.trim() })
    .select("id, task_id, author_id, content, created_at")
    .single();

  if (error) return { comment: null, error: error.message };
  return { comment: data as TaskComment, error: null };
}

// ============================================================
// PREVIOUS ATTEMPTS (TODO.md §22, migration 013)
// ============================================================

const ATTEMPT_COLUMNS =
  "id, task_id, problem, approach, outcome, result, failure_reason, files_changed, related_pr_url, agent, created_by, created_at";

export async function loadAttempts(
  projectId: string,
  taskId: string
): Promise<{ attempts: TaskAttempt[]; error: string | null }> {
  const access = await getProjectAccess(projectId);
  if (!access) return { attempts: [], error: "You do not have access to this project." };

  if (hasDirectDatabase()) {
    try {
      const result = await withUser(access.userId, ({ query }) =>
        query(
          `SELECT ${ATTEMPT_COLUMNS} FROM task_attempts WHERE task_id = $1 ORDER BY created_at DESC`,
          [taskId]
        )
      );
      return { attempts: result.rows, error: null };
    } catch (error) {
      return { attempts: [], error: error instanceof Error ? error.message : "Failed to load attempts." };
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("task_attempts")
    .select(ATTEMPT_COLUMNS)
    .eq("task_id", taskId)
    .order("created_at", { ascending: false });

  if (error) return { attempts: [], error: error.message };
  return { attempts: (data ?? []) as unknown as TaskAttempt[], error: null };
}

export async function createAttempt(
  projectId: string,
  input: {
    task_id: string;
    problem: string;
    approach: string;
    outcome: AttemptOutcome;
    result: string;
    failure_reason: string;
    files_changed: string;
    related_pr_url: string;
    agent: string;
  }
): Promise<{ attempt: TaskAttempt | null; error: string | null }> {
  const access = await getProjectAccess(projectId);
  // Mirrors task_attempts_insert (013): owner/admin/developer — not tester,
  // recording an implementation attempt is developer-tier work.
  if (!access || !canWriteProject(access.role)) {
    return { attempt: null, error: "You do not have permission to record an attempt." };
  }
  if (!input.problem.trim() || !input.approach.trim()) {
    return { attempt: null, error: "Problem and approach are required." };
  }

  const filesChanged = input.files_changed
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const values = {
    task_id: input.task_id,
    problem: input.problem.trim(),
    approach: input.approach.trim(),
    outcome: input.outcome,
    result: input.result.trim() || null,
    failure_reason: input.failure_reason.trim() || null,
    files_changed: filesChanged,
    related_pr_url: input.related_pr_url.trim() || null,
    agent: input.agent.trim() || null,
  };

  if (hasDirectDatabase()) {
    try {
      const result = await withUser(access.userId, ({ query }) =>
        query(
          `INSERT INTO task_attempts
             (task_id, problem, approach, outcome, result, failure_reason, files_changed, related_pr_url, agent, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING ${ATTEMPT_COLUMNS}`,
          [
            values.task_id,
            values.problem,
            values.approach,
            values.outcome,
            values.result,
            values.failure_reason,
            values.files_changed,
            values.related_pr_url,
            values.agent,
            access.userId,
          ]
        )
      );
      revalidatePath(`/projects/${projectId}/work`);
      return { attempt: result.rows[0] as TaskAttempt, error: null };
    } catch (error) {
      return { attempt: null, error: error instanceof Error ? error.message : "Failed to record attempt." };
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("task_attempts")
    .insert({ ...values, created_by: access.userId })
    .select(ATTEMPT_COLUMNS)
    .single();

  if (error) return { attempt: null, error: error.message };

  revalidatePath(`/projects/${projectId}/work`);
  return { attempt: data as unknown as TaskAttempt, error: null };
}

export async function deleteAttempt(
  projectId: string,
  attemptId: string
): Promise<TaskMutationResult> {
  const access = await getProjectAccess(projectId);
  // Mirrors task_attempts_delete (013): owner/admin only.
  if (!access || !canManageProject(access.role)) {
    return { error: "You do not have permission to delete this attempt." };
  }

  if (hasDirectDatabase()) {
    try {
      await withUser(access.userId, ({ query }) =>
        query("DELETE FROM task_attempts WHERE id = $1", [attemptId])
      );
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Failed to delete attempt." };
    }

    revalidatePath(`/projects/${projectId}/work`);
    return { error: null };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("task_attempts").delete().eq("id", attemptId);

  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}/work`);
  return { error: null };
}

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

  if (hasDirectDatabase()) {
    try {
      await withUser(access.userId, ({ query }) =>
        query("UPDATE tasks SET status = $1, sort_order = $2 WHERE id = $3", [
          status,
          Math.round(sortOrder),
          taskId,
        ])
      );
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Failed to move task." };
    }

    revalidatePath(`/projects/${projectId}/work`);
    return { error: null };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("tasks")
    .update({ status, sort_order: Math.round(sortOrder) })
    .eq("id", taskId);

  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}/work`);
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
 * whitelist is what keeps a raw `SET ${col} = $n` build safe regardless —
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
        query(`UPDATE tasks SET ${setClause} WHERE id = $${values.length + 1} RETURNING *`, [
          ...values,
          taskId,
        ])
      );
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
    .select()
    .single();

  if (error) return { task: null, error: error.message };

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
  if (!title.trim()) {
    return { task: null, error: "Title is required." };
  }

  if (hasDirectDatabase()) {
    try {
      const result = await withUser(access.userId, ({ query }) =>
        query(
          `INSERT INTO tasks (project_id, parent_task_id, title, status, priority, tags, created_by)
           VALUES ($1, $2, $3, 'todo', 'medium', $4, $5)
           RETURNING *`,
          [projectId, parentTaskId, title.trim(), [], access.userId]
        )
      );
      revalidatePath(`/projects/${projectId}/work`);
      return { task: result.rows[0] as Task, error: null };
    } catch (error) {
      return { task: null, error: error instanceof Error ? error.message : "Failed to create subtask." };
    }
  }

  const supabase = await createClient();
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

  revalidatePath(`/projects/${projectId}/work`);
  return { task: data as Task, error: null };
}

export async function toggleSubtask(
  projectId: string,
  subtaskId: string,
  done: boolean
): Promise<TaskActionResult> {
  const access = await getProjectAccess(projectId);
  // Mirrors tasks_update (001): owner/admin/developer.
  if (!access || !canWriteProject(access.role)) {
    return { task: null, error: "You do not have permission to update this subtask." };
  }

  const newStatus = done ? "done" : "todo";

  if (hasDirectDatabase()) {
    try {
      const result = await withUser(access.userId, ({ query }) =>
        query("UPDATE tasks SET status = $1 WHERE id = $2 RETURNING *", [newStatus, subtaskId])
      );
      revalidatePath(`/projects/${projectId}/work`);
      return { task: result.rows[0] as Task, error: null };
    } catch (error) {
      return { task: null, error: error instanceof Error ? error.message : "Failed to update this subtask." };
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .update({ status: newStatus })
    .eq("id", subtaskId)
    .select()
    .single();

  if (error) return { task: null, error: error.message };

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
      await withUser(access.userId, ({ query }) => query("DELETE FROM tasks WHERE id = $1", [taskId]));
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Failed to delete this task." };
    }

    revalidatePath(`/projects/${projectId}/work`);
    return { error: null };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("tasks").delete().eq("id", taskId);

  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}/work`);
  return { error: null };
}
