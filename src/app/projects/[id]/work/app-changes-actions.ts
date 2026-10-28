"use server";

import { revalidatePath } from "next/cache";
import { isValidUuid } from "@/lib/api/validate-id";
import { canWriteProject, getProjectAccess } from "@/lib/data/project-access";
import { dataClient } from "@/lib/data-client";
import { tr } from "@/lib/i18n/server-errors";
import {
  TRACKED_TASK_FIELDS,
  parseAppChange,
  parseUndo,
  undoPatch,
  type TaskFieldChanges,
  type TrackedTaskField,
} from "@/lib/work/app-changes-core";
import type { ProjectRole } from "@/types/project";
import type { Task } from "@/types/task";

/** One change an app (API key, MCP client, GitHub) made to a task, as the task dialog lists it. */
export type TaskAppChange = {
  id: string;
  createdAt: string;
  /** Who made it: a bot label ("GitHub", "Discord bot"), else the key's name, else null. */
  appName: string | null;
  /** The person whose key or connection it was. */
  userId: string | null;
  changes: TaskFieldChanges;
  undone: boolean;
};

type LogRow = {
  id: string;
  user_id: string | null;
  actor_label: string | null;
  details: unknown;
  created_at: string;
};

const LOG_COLUMNS = "id, user_id, actor_label, details, created_at";

/**
 * The task's log rows. activity_logs takes inserts from any project member
 * (activity_logs_insert, 001), so an "app change" row only counts when its
 * author may edit tasks - the only people whose keys can change a task. A
 * row forged by anyone else is dropped instead of being offered for undo.
 */
async function taskLogs(userId: string, projectId: string, taskId: string) {
  const db = dataClient(userId);
  const [logs, members] = await Promise.all([
    db
      .from<LogRow>("activity_logs")
      .select(LOG_COLUMNS)
      .eq("project_id", projectId)
      .eq("entity_type", "task")
      .eq("entity_id", taskId)
      .order("created_at", { ascending: false })
      .limit(100),
    db.from<{ user_id: string; role: ProjectRole }>("project_members").select("user_id, role").eq("project_id", projectId),
  ]);
  if (logs.error || members.error) return { data: [] as LogRow[], error: logs.error ?? members.error };
  const editors = new Set(members.data.filter((member) => canWriteProject(member.role)).map((member) => member.user_id));
  return { data: logs.data.filter((row) => row.user_id !== null && editors.has(row.user_id)), error: null };
}

export async function loadTaskAppChanges(
  projectId: string,
  taskId: string
): Promise<{ changes: TaskAppChange[]; error: string | null }> {
  const access = await getProjectAccess(projectId);
  if (!access) return { changes: [], error: await tr("You do not have access to this project.") };
  if (!isValidUuid(taskId)) return { changes: [], error: await tr("Invalid task id.") };

  const { data, error } = await taskLogs(access.userId, projectId, taskId);
  if (error) return { changes: [], error: error.message };

  const undone = new Set(data.map((row) => parseUndo(row.details)?.undo_of).filter(Boolean));
  const changes: TaskAppChange[] = [];
  for (const row of data) {
    const change = parseAppChange(row.details);
    if (!change) continue;
    changes.push({
      id: row.id,
      createdAt: row.created_at,
      appName: row.actor_label ?? change.key_name,
      userId: row.user_id,
      changes: change.changes,
      undone: undone.has(row.id),
    });
  }
  return { changes: changes.slice(0, 20), error: null };
}

/**
 * Puts the task back where the app found it. Only fields that still hold the
 * app's value are restored - a person's later edit is never overwritten - and
 * the undo is logged like any other edit (it bumps the task's revision, so an
 * open editor gets the usual conflict instead of silently saving over it).
 */
export async function undoTaskAppChange(
  projectId: string,
  taskId: string,
  changeId: string
): Promise<{ error: string | null; changedSince: TrackedTaskField[]; task?: Task }> {
  const access = await getProjectAccess(projectId);
  if (!access || !canWriteProject(access.role)) {
    return { error: await tr("You do not have permission to edit this task."), changedSince: [] };
  }
  if (!isValidUuid(taskId) || !isValidUuid(changeId)) return { error: await tr("Invalid task id."), changedSince: [] };

  const db = dataClient(access.userId);
  const { data: logs, error: logError } = await taskLogs(access.userId, projectId, taskId);
  if (logError) return { error: logError.message, changedSince: [] };
  const row = logs.find((log) => log.id === changeId);
  const change = row ? parseAppChange(row.details) : null;
  if (!change || logs.some((log) => parseUndo(log.details)?.undo_of === changeId)) {
    return { error: await tr("This change was already undone or no longer exists."), changedSince: [] };
  }

  const { data: current, error: taskError } = await db
    .from<Record<string, unknown>>("tasks")
    .select(TRACKED_TASK_FIELDS.join(", "))
    .eq("id", taskId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (taskError) return { error: taskError.message, changedSince: [] };
  if (!current) return { error: await tr("Task not found."), changedSince: [] };

  const { patch, reverted, changedSince } = undoPatch(change.changes, current);
  if (Object.keys(patch).length === 0) {
    return { error: await tr("Someone changed this since, so there is nothing to undo."), changedSince };
  }

  const { data: updated, error: updateError } = await db
    .from<Task>("tasks")
    .update(patch)
    .eq("id", taskId)
    .eq("project_id", projectId)
    .select("*");
  if (updateError) return { error: updateError.message, changedSince };
  if (updated.length === 0) return { error: await tr("You do not have permission to edit this task."), changedSince };

  await db.from("activity_logs").insert({
    project_id: projectId,
    user_id: access.userId,
    action: "task_updated",
    entity_type: "task",
    entity_id: taskId,
    details: { undo_of: changeId, changes: reverted },
  });

  revalidatePath(`/projects/${projectId}/work`);
  return { error: null, changedSince, task: updated[0] };
}
