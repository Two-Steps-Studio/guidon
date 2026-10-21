"use server";

import { getCurrentUser } from "@/lib/data/current-user";
import { dataClient } from "@/lib/data-client";
import { isValidUuid } from "@/lib/api/validate-id";
import { MAX_PINNED_TASKS, getPinnedTaskIds, getPinnedTasks, type PinnedTask } from "@/lib/data/pinned-tasks";

export type PinTaskResult = { pinned: PinnedTask[]; error: "too_many" | "failed" | null };

/** Pins or unpins one task for the signed-in person (migration 074); answers the new list for the sidebar. */
export async function setTaskPinned(taskId: string, pin: boolean): Promise<PinTaskResult> {
  const user = await getCurrentUser();
  if (!isValidUuid(taskId)) return { pinned: await getPinnedTasks(user.id), error: "failed" };
  const db = dataClient(user.id);
  const current = await getPinnedTaskIds(user.id);

  if (pin && !current.includes(taskId)) {
    // Only a task the person can actually see (RLS) gets pinned.
    const { data: task } = await db.from<{ id: string }>("tasks").select("id").eq("id", taskId).maybeSingle();
    if (!task) return { pinned: await getPinnedTasks(user.id), error: "failed" };
  }

  let next = pin ? (current.includes(taskId) ? current : [...current, taskId]) : current.filter((id) => id !== taskId);
  // Pins of deleted or no-longer-visible tasks don't count against the limit.
  if (next.length > MAX_PINNED_TASKS) {
    const { data: visible } = await db.from<{ id: string }>("tasks").select("id").in("id", next);
    const visibleIds = new Set((visible ?? []).map((row) => row.id));
    next = next.filter((id) => visibleIds.has(id));
    if (next.length > MAX_PINNED_TASKS) return { pinned: await getPinnedTasks(user.id), error: "too_many" };
  }

  const { data, error } = await db
    .from("profiles")
    .update({ pinned_task_ids: next })
    .eq("id", user.id)
    .select<{ id: string }>("id");
  if (error || !data.length) return { pinned: await getPinnedTasks(user.id, current), error: "failed" };
  return { pinned: await getPinnedTasks(user.id, next), error: null };
}
