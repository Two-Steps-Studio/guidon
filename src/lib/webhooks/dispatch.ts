import "server-only";

import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { hasDirectDatabase } from "@/lib/db/pool";
import { SITE_URL } from "@/lib/site-url";
import {
  getWebhookTargetsForProject,
  recordWebhookDelivery,
  type WebhookTarget,
} from "@/lib/data/organization-webhooks";
import type { WebhookEventType } from "./events";
import { checkWebhookUrl, signWebhookPayload } from "./security";

const DELIVERY_TIMEOUT_MS = 5_000;

export type TaskEvent =
  | { kind: "created"; taskId: string; title: string }
  | { kind: "status_changed"; taskId: string; title: string; status: string }
  | { kind: "completed"; taskId: string; title: string };

export interface DeliveryOutcome {
  status: number | null;
  error: string | null;
}

/**
 * One POST, signed, with no redirects followed (a redirect could point back
 * at a private address the URL check already refused). The URL is checked
 * again here, not just when saved, because DNS can change in between.
 */
export async function deliverWebhook(
  target: Pick<WebhookTarget, "id" | "url" | "secret">,
  type: WebhookEventType | "ping",
  payload: Record<string, unknown>
): Promise<DeliveryOutcome> {
  const urlCheck = await checkWebhookUrl(target.url, { allowPrivate: hasDirectDatabase() });
  if (!urlCheck.ok) return { status: null, error: urlCheck.reason };

  const deliveryId = randomUUID();
  const timestamp = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({ id: deliveryId, type, created_at: new Date(timestamp * 1000).toISOString(), ...payload });

  try {
    const response = await fetch(urlCheck.url, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Guidon-Webhooks/1.0",
        "X-Guidon-Event": type,
        "X-Guidon-Delivery": deliveryId,
        "X-Guidon-Timestamp": String(timestamp),
        "X-Guidon-Signature": signWebhookPayload(target.secret, timestamp, body),
      },
      body,
    });
    await response.body?.cancel();
    if (response.status >= 300 && response.status < 400) {
      return { status: response.status, error: "Redirects are not followed - use the final URL." };
    }
    return { status: response.status, error: response.ok ? null : `Receiver responded with HTTP ${response.status}.` };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return {
      status: null,
      error: timedOut ? `No response within ${DELIVERY_TIMEOUT_MS / 1000}s.` : "Could not connect to the receiver.",
    };
  }
}

/**
 * Moving a task to Done fires "completed" rather than "status_changed", so a
 * webhook that only subscribed to status changes still hears about it - as
 * a status change - instead of silently missing every task that finishes.
 */
function eventTypeFor(event: TaskEvent, subscribed: readonly WebhookEventType[]): WebhookEventType | null {
  const wanted: WebhookEventType[] =
    event.kind === "created"
      ? ["task.created"]
      : event.kind === "status_changed"
        ? ["task.status_changed"]
        : ["task.completed", "task.status_changed"];
  return wanted.find((type) => subscribed.includes(type)) ?? null;
}

/**
 * Sends a task event to every enabled webhook of the project's organization.
 * Runs in after() like notifyDiscordTaskEvent, so the task action never
 * waits on third-party servers; failures are recorded on the webhook row
 * (shown in Organization settings) and never thrown.
 */
export function notifyOrganizationWebhooks(projectId: string, userId: string, event: TaskEvent): void {
  after(async () => {
    try {
      const found = await getWebhookTargetsForProject(projectId);
      if (!found || found.targets.length === 0) return;

      const task = {
        id: event.taskId,
        title: event.title,
        status: event.kind === "completed" ? "done" : event.kind === "status_changed" ? event.status : undefined,
        url: `${SITE_URL}/projects/${projectId}/work`,
      };

      await Promise.all(
        found.targets.map(async (target) => {
          const type = eventTypeFor(event, target.events);
          if (!type) return;
          const outcome = await deliverWebhook(target, type, {
            organization_id: found.organizationId,
            project: { id: projectId, name: found.projectName },
            actor_id: userId,
            data: { task },
          });
          await recordWebhookDelivery(target.id, outcome);
        })
      );
    } catch (error) {
      console.error(`notifyOrganizationWebhooks(${event.kind}) failed:`, error);
    }
  });
}
