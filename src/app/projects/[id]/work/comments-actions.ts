"use server";

// Task comments - split out of actions.ts (tasks themselves stay there).

import { createClient } from "@/lib/supabase-server";
import { canCommentOnProject, getProjectAccess } from "@/lib/data/project-access";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";

export type TaskComment = {
  id: string;
  task_id: string;
  author_id: string;
  content: string;
  created_at: string;
  actor_label: string | null;
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
          "SELECT id, task_id, author_id, content, created_at, actor_label FROM task_comments WHERE task_id = $1 ORDER BY created_at ASC",
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
    .select("id, task_id, author_id, content, created_at, actor_label")
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
           RETURNING id, task_id, author_id, content, created_at, actor_label`,
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
    .select("id, task_id, author_id, content, created_at, actor_label")
    .single();

  if (error) return { comment: null, error: error.message };
  return { comment: data as TaskComment, error: null };
}
