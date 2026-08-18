"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import {
  canCommentOnProject,
  canManageProject,
  canWriteProject,
  getProjectAccess,
} from "@/lib/data/project-access";
import type { Task, TaskPriority, TaskStatus, UpdateTaskData } from "@/types/task";

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

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("task_comments")
    .insert({ task_id: taskId, author_id: access.userId, content: content.trim() })
    .select("id, task_id, author_id, content, created_at")
    .single();

  if (error) return { comment: null, error: error.message };
  return { comment: data as TaskComment, error: null };
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

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      project_id: projectId,
      title: input.title.trim(),
      description: input.description.trim() || null,
      status: input.status,
      priority: input.priority,
      assignee_id: input.assigneeId || null,
      due_date: input.dueDate ? new Date(input.dueDate).toISOString() : null,
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

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .update({ status: done ? "done" : "todo" })
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

  const supabase = await createClient();
  const { error } = await supabase.from("tasks").delete().eq("id", taskId);

  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}/work`);
  return { error: null };
}
