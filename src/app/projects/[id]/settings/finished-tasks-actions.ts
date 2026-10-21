"use server";

import { revalidatePath } from "next/cache";
import { canManageProject, getProjectAccess } from "@/lib/data/project-access";
import { dataClient } from "@/lib/data-client";
import { purgeFinishedTasks } from "@/lib/work/finished-cleanup";
import { DONE_CLEANUP_OPTIONS } from "@/lib/work/done-cleanup-options";
import { tr } from "@/lib/i18n/server-errors";

/**
 * "Delete finished tasks after N days" (migration 061). Owner/admin only -
 * same as the projects_update policy it goes through.
 */

const isOption = (days: number | null) => days === null || (DONE_CLEANUP_OPTIONS as readonly number[]).includes(days);

/** How many top-level tasks have been finished for longer than `days` - what saving would delete right away. */
export async function countFinishedTasksOlderThan(projectId: string, days: number): Promise<number | null> {
  const access = await getProjectAccess(projectId);
  if (!access || !canManageProject(access.role) || !isOption(days)) return null;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await dataClient(access.userId)
    .from("tasks")
    .eq("project_id", projectId)
    .is("parent_task_id", null)
    .eq("is_done", true)
    .lt("done_at", cutoff)
    .count();
  return error ? null : data;
}

export async function updateDoneCleanup(
  projectId: string,
  days: number | null
): Promise<{ error: string | null; deleted: number }> {
  const access = await getProjectAccess(projectId);
  if (!access || !canManageProject(access.role)) {
    return { error: await tr("Only the project's owner or admins can change this."), deleted: 0 };
  }
  if (!isOption(days)) return { error: await tr("Pick one of the listed periods."), deleted: 0 };

  const { data, error } = await dataClient(access.userId)
    .from("projects")
    .update({ done_cleanup_days: days })
    .eq("id", projectId)
    .select<{ id: string }>("id");
  if (error) return { error: error.message, deleted: 0 };
  if (data.length === 0) return { error: await tr("Project not found."), deleted: 0 };

  // Apply it now rather than on the next board visit, so "saved" means done.
  const deleted = days === null ? 0 : await purgeFinishedTasks(access.userId, projectId, { force: true });
  revalidatePath(`/projects/${projectId}/work`);
  return { error: null, deleted };
}
