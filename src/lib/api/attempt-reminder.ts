import "server-only";

import type { DataClient } from "@/lib/data-client";

/**
 * Dead ends only help if agents record them. An agent that claimed a task
 * with start_task and hands it back (review, done, any other column) without
 * a single record_attempt since gets a reminder in the response - the text
 * it reads next - instead of the trail silently going missing. Never blocks.
 */
export const ATTEMPT_REMINDER =
  "You worked on this task (start_task) but recorded no attempt since. Call record_attempt with what you tried and the outcome - failed and partial ones too, with the reason - so the next person or agent doesn't repeat it.";

/** When the caller's own claim on the task began, or null (no claim: a person, or an agent that never started it). */
export async function ownClaimStart(db: DataClient, taskId: string, apiKeyId: string | null | undefined): Promise<string | null> {
  if (!apiKeyId) return null;
  const { data } = await db
    .from<{ holder_key_id: string; claimed_at: string | Date }>("task_claims")
    .select("holder_key_id, claimed_at")
    .eq("task_id", taskId)
    .maybeSingle();
  return data && data.holder_key_id === apiKeyId ? new Date(data.claimed_at).toISOString() : null;
}

/** The reminder when no attempt on the task was recorded since `since`; null otherwise or on a read error. */
export async function missingAttemptReminder(db: DataClient, taskId: string, since: string): Promise<string | null> {
  const { data, error } = await db.from<{ id: string }>("task_attempts").select("id").eq("task_id", taskId).gte("created_at", since).limit(1);
  return error || data.length ? null : ATTEMPT_REMINDER;
}
