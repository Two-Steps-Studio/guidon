import "server-only";

import { cache } from "react";
import { dataClient } from "@/lib/data-client";

/** At most this many tasks pinned per person (migration 074's CHECK). */
export const MAX_PINNED_TASKS = 10;

export interface PinnedTask {
  id: string;
  title: string;
  project_id: string;
  project_name: string | null;
  is_done: boolean;
}

/** The ids, in pinning order; [] before migration 074 (the column isn't there yet). */
export const getPinnedTaskIds = cache(async function getPinnedTaskIds(userId: string): Promise<string[]> {
  const { data, error } = await dataClient(userId)
    .from<{ pinned_task_ids: string[] | null }>("profiles")
    .select("pinned_task_ids")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return [];
  return data.pinned_task_ids ?? [];
});

/**
 * The pinned tasks the person can still see (RLS), in pinning order, with
 * their project's name for the sidebar. Deleted or no-longer-visible ones
 * are skipped, not removed - pinning again cleans them up.
 */
export async function getPinnedTasks(userId: string, pinnedIds?: string[]): Promise<PinnedTask[]> {
  // getPinnedTaskIds is cached per request - after a change, pass the new ids.
  const ids = pinnedIds ?? (await getPinnedTaskIds(userId));
  if (ids.length === 0) return [];
  const db = dataClient(userId);
  const { data: tasks } = await db
    .from<{ id: string; title: string; project_id: string; is_done: boolean | null }>("tasks")
    .select("id, title, project_id, is_done")
    .in("id", ids);
  if (!tasks?.length) return [];
  const projectIds = [...new Set(tasks.map((task) => task.project_id))];
  const { data: projects } = await db.from<{ id: string; name: string }>("projects").select("id, name").in("id", projectIds);
  const projectName = new Map((projects ?? []).map((project) => [project.id, project.name]));
  const byId = new Map(tasks.map((task) => [task.id, task]));
  return ids.flatMap((id) => {
    const task = byId.get(id);
    return task
      ? [{ id: task.id, title: task.title, project_id: task.project_id, project_name: projectName.get(task.project_id) ?? null, is_done: task.is_done === true }]
      : [];
  });
}
