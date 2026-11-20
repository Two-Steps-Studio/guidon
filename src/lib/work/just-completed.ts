/**
 * Tasks the person on this page just finished, so their card can celebrate
 * once (the check pops, Gido hops) - only for their own action, never for a
 * page load or someone else's change arriving. Module state on purpose: the
 * card remounts in the done column, so it can't remember this itself.
 */
const completedAt = new Map<string, number>();
const CELEBRATE_MS = 1500;

export const TASK_COMPLETED_EVENT = "guidon:task-completed";

export function markJustCompleted(taskIds: readonly string[]) {
  const now = Date.now();
  taskIds.forEach((id) => completedAt.set(id, now));
  window.dispatchEvent(new Event(TASK_COMPLETED_EVENT));
}

export function wasJustCompleted(taskId: string): boolean {
  const at = completedAt.get(taskId);
  return at !== undefined && Date.now() - at < CELEBRATE_MS;
}
