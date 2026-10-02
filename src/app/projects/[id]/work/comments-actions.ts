"use server";

// Task comments - split out of actions.ts (tasks themselves stay there).

import { canCommentOnProject, getProjectAccess } from "@/lib/data/project-access";
import { dataClient } from "@/lib/data-client";

export type TaskComment = {
  id: string;
  task_id: string;
  author_id: string;
  content: string;
  created_at: string;
  actor_label: string | null;
};

const COMMENT_COLUMNS = "id, task_id, author_id, content, created_at, actor_label";

export async function loadComments(
  projectId: string,
  taskId: string
): Promise<{ comments: TaskComment[]; error: string | null }> {
  const access = await getProjectAccess(projectId);
  if (!access) return { comments: [], error: "You do not have access to this project." };

  const { data, error } = await dataClient(access.userId)
    .from<TaskComment>("task_comments")
    .select(COMMENT_COLUMNS)
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });

  if (error) return { comments: [], error: error.message };
  return { comments: data, error: null };
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

  const { data, error } = await dataClient(access.userId)
    .from("task_comments")
    .insert({ task_id: taskId, author_id: access.userId, content: content.trim() })
    .select<TaskComment>(COMMENT_COLUMNS)
    .single();

  if (error || !data) return { comment: null, error: error?.message ?? "Failed to post comment." };
  return { comment: data, error: null };
}
