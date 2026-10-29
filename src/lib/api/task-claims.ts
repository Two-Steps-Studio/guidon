import "server-only";

import type { DataClient } from "@/lib/data-client";

/**
 * One agent per task at a time (migration 100): start_task claims the task
 * for the calling API key with a lease; while it runs, another key's status
 * changes and edits get 409 instead of overwriting the first agent's work.
 * A lease that runs out is taken over by the next start_task. Moving the
 * task out of AI Working (review, done, a person moving the card) releases
 * it (trigger). Human-operated clients and people in the browser are not
 * blocked - a person can always take a task back.
 */

/** Long enough for real work, short enough that an abandoned task comes back the same day. */
export const DEFAULT_LEASE_SECONDS = 2 * 60 * 60;

export type TaskClaim = { claimed: boolean; holder_key_id: string; holder_label: string | null; claimed_at: string; expires_at: string };

export async function claimTask(db: DataClient, taskId: string, apiKeyId: string, label: string | null): Promise<{ claim: TaskClaim | null; error: string | null }> {
  const { data, error } = await db.rpcRows<TaskClaim>("claim_task", {
    p_task_id: taskId,
    p_key_id: apiKeyId,
    p_label: label ?? "An agent",
    p_lease_seconds: DEFAULT_LEASE_SECONDS,
  });
  if (error) return { claim: null, error: error.message };
  return { claim: data[0] ?? null, error: null };
}

/** Another key's lease that is still running, or null. */
export async function foreignClaim(db: DataClient, taskId: string, apiKeyId: string): Promise<TaskClaim | null> {
  const { data } = await db
    .from<TaskClaim>("task_claims")
    .select("holder_key_id, holder_label, claimed_at, expires_at")
    .eq("task_id", taskId)
    .maybeSingle();
  if (!data || data.holder_key_id === apiKeyId || new Date(data.expires_at).getTime() <= Date.now()) return null;
  return { ...data, claimed: false };
}

export function claimedElsewhereMessage(claim: Pick<TaskClaim, "holder_label" | "expires_at">): string {
  return `Another agent (${claim.holder_label ?? "unnamed"}) is working on this task until ${new Date(claim.expires_at).toISOString()}. Pick another task, or wait for its lease to end.`;
}
