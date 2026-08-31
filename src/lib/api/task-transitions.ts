import "server-only";

import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { getApiUserClient } from "./api-key-auth";
import type { TaskStatus } from "@/types/task";
import type { ActivityAction } from "@/types/api";

export type TransitionResult =
  | { ok: true; task: Record<string, unknown> }
  | { ok: false; error: string; status: number };

interface ProjectAiPermissions {
  can_change_status: boolean;
  can_complete_tasks: boolean;
}

async function loadProjectContext(
  userId: string,
  taskId: string
): Promise<{ projectId: string; allowAutoComplete: boolean; permissions: ProjectAiPermissions } | null> {
  if (hasDirectDatabase()) {
    return withUser(userId, async ({ query }) => {
      const task = await query("SELECT project_id FROM tasks WHERE id = $1", [taskId]);
      if (task.rows.length === 0) return null;
      const projectId = task.rows[0].project_id as string;

      const project = await query("SELECT allow_ai_auto_complete FROM projects WHERE id = $1", [projectId]);
      const perms = await query(
        "SELECT can_change_status, can_complete_tasks FROM project_ai_permissions WHERE project_id = $1",
        [projectId]
      );

      return {
        projectId,
        allowAutoComplete: project.rows[0]?.allow_ai_auto_complete ?? false,
        permissions: perms.rows[0] ?? { can_change_status: true, can_complete_tasks: false },
      };
    });
  }

  const supabase = await getApiUserClient(userId);

  const { data: task } = await supabase.from("tasks").select("project_id").eq("id", taskId).maybeSingle();
  if (!task) return null;

  const [{ data: project }, { data: perms }] = await Promise.all([
    supabase.from("projects").select("allow_ai_auto_complete").eq("id", task.project_id).maybeSingle(),
    supabase
      .from("project_ai_permissions")
      .select("can_change_status, can_complete_tasks")
      .eq("project_id", task.project_id)
      .maybeSingle(),
  ]);

  return {
    projectId: task.project_id,
    allowAutoComplete: project?.allow_ai_auto_complete ?? false,
    permissions: perms ?? { can_change_status: true, can_complete_tasks: false },
  };
}

async function setStatusAndLog(
  userId: string,
  taskId: string,
  projectId: string,
  newStatus: TaskStatus,
  action: ActivityAction
): Promise<TransitionResult> {
  if (hasDirectDatabase()) {
    return withUser(userId, async ({ query }) => {
      const result = await query("UPDATE tasks SET status = $1 WHERE id = $2 RETURNING *", [newStatus, taskId]);
      // tasks_select (any project member, including viewer) is broader than
      // tasks_update (owner/admin/developer only) - loadProjectContext's own
      // SELECT above already proved the task is visible to this API key's
      // user, which says nothing about whether they're also allowed to
      // update it. A caller below that role passes every check up to here
      // and then RLS silently filters the UPDATE to zero matched rows - no
      // error, just an empty RETURNING - which used to come back as
      // `{ ok: true, task: undefined }`, a 200 that did nothing.
      if (result.rows.length === 0) {
        return {
          ok: false,
          error: "This API key's user does not have permission to update this task.",
          status: 403,
        };
      }
      await query(
        `INSERT INTO activity_logs (project_id, user_id, action, entity_type, entity_id)
         VALUES ($1, $2, $3, 'task', $4)`,
        [projectId, userId, action, taskId]
      );
      return { ok: true, task: result.rows[0] };
    });
  }

  const supabase = await getApiUserClient(userId);
  const { data, error } = await supabase
    .from("tasks")
    .update({ status: newStatus })
    .eq("id", taskId)
    .select()
    .single();

  if (error) {
    // .single() errors whenever the UPDATE...RETURNING matched zero rows -
    // since `id` is a primary key, that can only mean RLS filtered it out
    // (this API key's user lacks the owner/admin/developer role tasks_update
    // requires), not "no such task" (loadProjectContext's SELECT already
    // proved this row is visible). Same reasoning as the direct-Postgres
    // branch above.
    if (error.code === "PGRST116") {
      return {
        ok: false,
        error: "This API key's user does not have permission to update this task.",
        status: 403,
      };
    }
    return { ok: false, error: error.message, status: 400 };
  }

  await supabase
    .from("activity_logs")
    .insert({ project_id: projectId, user_id: userId, action, entity_type: "task", entity_id: taskId });

  return { ok: true, task: data };
}

export async function startTask(userId: string, taskId: string): Promise<TransitionResult> {
  const ctx = await loadProjectContext(userId, taskId);
  if (!ctx) return { ok: false, error: "Task not found.", status: 404 };
  if (!ctx.permissions.can_change_status) {
    return { ok: false, error: "AI is not permitted to change task status on this project.", status: 403 };
  }
  return setStatusAndLog(userId, taskId, ctx.projectId, "ai_working", "task_ai_started");
}

export async function completeTask(userId: string, taskId: string): Promise<TransitionResult> {
  const ctx = await loadProjectContext(userId, taskId);
  if (!ctx) return { ok: false, error: "Task not found.", status: 404 };
  if (!ctx.allowAutoComplete) {
    return {
      ok: false,
      error: "This project does not allow AI to auto-complete tasks. Ask a project admin to enable it in Settings.",
      status: 403,
    };
  }
  if (!ctx.permissions.can_complete_tasks) {
    return { ok: false, error: "This API key's AI permissions do not include completing tasks.", status: 403 };
  }
  return setStatusAndLog(userId, taskId, ctx.projectId, "done", "task_ai_completed");
}

export async function setTaskStatus(userId: string, taskId: string, newStatus: TaskStatus): Promise<TransitionResult> {
  const ctx = await loadProjectContext(userId, taskId);
  if (!ctx) return { ok: false, error: "Task not found.", status: 404 };
  if (!ctx.permissions.can_change_status) {
    return { ok: false, error: "AI is not permitted to change task status on this project.", status: 403 };
  }
  if (newStatus === "done" && !(ctx.allowAutoComplete && ctx.permissions.can_complete_tasks)) {
    return {
      ok: false,
      error: "Completing a task requires allow_ai_auto_complete and the can_complete_tasks permission. Use /review instead.",
      status: 403,
    };
  }
  return setStatusAndLog(userId, taskId, ctx.projectId, newStatus, "task_ai_status_changed");
}
