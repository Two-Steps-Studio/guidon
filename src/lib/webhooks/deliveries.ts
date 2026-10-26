import "server-only";

import { serviceDataClient } from "@/lib/data-client";
import {
  getWebhookTargetForDelivery,
  recordWebhookDelivery,
  type WebhookTarget,
} from "@/lib/data/organization-webhooks";
import { deliverWebhook } from "./dispatch";
import type { WebhookEventType } from "./events";
import { CLAIM_LEASE_MS, stateAfterAttempt } from "./retry";

/**
 * The webhook delivery queue (migration 089). Every event for every webhook
 * is a row; it is tried at once, and a failure a retry can fix is tried
 * again later on the schedule in retry.ts. Later attempts are picked up by
 * processDueDeliveries: after each new event, from /api/cron/webhooks, and
 * by "Retry" in the webhook's history. Service role throughout - every
 * caller has already checked permissions, and receivers' secrets are needed.
 *
 * A row is claimed before an attempt by moving next_attempt_at a couple of
 * minutes ahead in a single conditional UPDATE, so two processes (a cron run
 * and an event) never send the same delivery at the same time.
 */

const TABLE = "organization_webhook_deliveries";
const COLUMNS = "id, webhook_id, organization_id, event_type, payload, attempts, created_at";
const HISTORY_DAYS = 30;

interface DeliveryRow {
  id: string;
  webhook_id: string;
  organization_id: string;
  event_type: WebhookEventType;
  payload: Record<string, unknown>;
  attempts: number;
  created_at: string | Date;
}

const leaseUntil = (now: Date) => new Date(now.getTime() + CLAIM_LEASE_MS).toISOString();

async function attempt(row: DeliveryRow, target: WebhookTarget): Promise<void> {
  const outcome = await deliverWebhook(target, row.event_type, row.payload, {
    deliveryId: row.id,
    createdAt: new Date(row.created_at).toISOString(),
  });
  const attempts = row.attempts + 1;
  const now = new Date();
  const next = stateAfterAttempt(attempts, outcome, now);
  await serviceDataClient()
    .from(TABLE)
    .update({
      ...next,
      attempts,
      last_status: outcome.status,
      last_error: outcome.error ? outcome.error.slice(0, 300) : null,
      updated_at: now.toISOString(),
      delivered_at: next.status === "succeeded" ? now.toISOString() : null,
    })
    .eq("id", row.id);
  await recordWebhookDelivery(target.id, outcome);
}

/** Queues one event for one webhook and makes the first attempt right away. */
export async function enqueueAndDeliver(
  target: WebhookTarget,
  organizationId: string,
  type: WebhookEventType,
  payload: Record<string, unknown>
): Promise<void> {
  const { data, error } = await serviceDataClient()
    .from<DeliveryRow>(TABLE)
    .insert({
      webhook_id: target.id,
      organization_id: organizationId,
      event_type: type,
      payload,
      status: "pending",
      // Born claimed by this process for its first attempt.
      next_attempt_at: leaseUntil(new Date()),
    })
    .select(COLUMNS)
    .single();
  if (error || !data) {
    // No queue (089 not applied yet): one attempt, as before the queue existed.
    console.error("[webhooks] delivery not queued:", error?.message);
    const outcome = await deliverWebhook(target, type, payload);
    await recordWebhookDelivery(target.id, outcome);
    return;
  }
  await attempt(data, target);
}

/** Claims one pending delivery whose time has come; false if someone else has it. */
async function claim(id: string, now: Date): Promise<boolean> {
  const { data } = await serviceDataClient()
    .from(TABLE)
    .update({ next_attempt_at: leaseUntil(now), updated_at: now.toISOString() })
    .eq("id", id)
    .eq("status", "pending")
    .lte("next_attempt_at", now.toISOString())
    .select("id");
  return Boolean(data?.length);
}

/** Tries deliveries that are due, oldest first. Returns how many were attempted. */
export async function processDueDeliveries(limit = 20): Promise<{ attempted: number }> {
  const db = serviceDataClient();
  const now = new Date();
  const { data: due, error } = await db
    .from<DeliveryRow>(TABLE)
    .select(COLUMNS)
    .eq("status", "pending")
    .lte("next_attempt_at", now.toISOString())
    .order("next_attempt_at")
    .limit(limit);
  if (error) return { attempted: 0 };

  let attempted = 0;
  for (const row of due) {
    if (!(await claim(row.id, now))) continue;
    const target = await getWebhookTargetForDelivery(row.webhook_id);
    if (!target || !target.enabled) {
      await db
        .from(TABLE)
        .update({ status: "failed", next_attempt_at: null, last_error: "The webhook was turned off.", updated_at: now.toISOString() })
        .eq("id", row.id);
      continue;
    }
    await attempt(row, target);
    attempted++;
  }

  // Finished deliveries are kept for a month of history.
  await db
    .from(TABLE)
    .delete()
    .neq("status", "pending")
    .lt("created_at", new Date(now.getTime() - HISTORY_DAYS * 86_400_000).toISOString());
  return { attempted };
}

/**
 * "Retry" in the webhook history: one more attempt now, whatever the state.
 * The caller has checked the person may manage this organization's webhooks.
 */
export async function retryDelivery(organizationId: string, deliveryId: string): Promise<{ error: string | null }> {
  const db = serviceDataClient();
  const now = new Date();
  const { data: row } = await db
    .from<DeliveryRow & { status: string }>(TABLE)
    .select(`${COLUMNS}, status`)
    .eq("id", deliveryId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!row) return { error: "not_found" };
  if (row.status === "succeeded") return { error: "already_delivered" };
  if (row.attempts >= 20) return { error: "too_many_attempts" };
  // Take it over: pending and leased to this request, so a cron run can't send it too.
  const { data: taken } = await db
    .from(TABLE)
    .update({ status: "pending", next_attempt_at: leaseUntil(now), updated_at: now.toISOString() })
    .eq("id", deliveryId)
    .eq("organization_id", organizationId)
    .neq("status", "succeeded")
    .select("id");
  if (!taken?.length) return { error: "not_found" };
  const target = await getWebhookTargetForDelivery(row.webhook_id);
  if (!target || !target.enabled) {
    await db.from(TABLE).update({ status: "failed", next_attempt_at: null, last_error: "The webhook was turned off.", updated_at: now.toISOString() }).eq("id", deliveryId);
    return { error: "disabled" };
  }
  await attempt(row, target);
  return { error: null };
}
