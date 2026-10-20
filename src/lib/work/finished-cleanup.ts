import "server-only";

import { dataClient } from "@/lib/data-client";
import { createRateLimitWindow } from "@/lib/ai/rate-limit-window";

/**
 * Project settings -> "Delete finished tasks after N days" (migration 061).
 * There's no job scheduler, so the cleanup runs when someone opens the
 * board - the one place a long Done column is seen - and right after the
 * setting is saved. The database function does the work and decides
 * everything (is it on, how old is old, which tasks); this only keeps it to
 * one call per project per few minutes in this process.
 *
 * Never fails the page: a database that doesn't have migration 061 yet
 * (hosted, before it's run) answers with an error, which just means no
 * cleanup.
 */

const throttle = createRateLimitWindow(1, 5 * 60 * 1000);

export async function purgeFinishedTasks(userId: string, projectId: string, { force = false } = {}): Promise<number> {
  if (!force && throttle.isLimited(projectId)) return 0;
  throttle.record(projectId);
  try {
    const { data, error } = await dataClient(userId).rpc<number>("purge_finished_tasks", { p_project_id: projectId });
    if (error) return 0;
    return Number(data ?? 0);
  } catch {
    return 0;
  }
}
