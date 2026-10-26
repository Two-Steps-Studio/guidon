import "server-only";

import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { hasDirectDatabase } from "@/lib/db/pool";
import { SITE_URL } from "@/lib/site-url";
import {
  getWebhookTargetsForProject,
  type WebhookTarget,
} from "@/lib/data/organization-webhooks";
import type { WebhookEventType } from "./events";
import { checkWebhookUrl, guardedRequest, signWebhookPayload } from "./security";
import { signRequest, signingKeyFromEnv } from "@/lib/web-bot-auth";
import { describeReceiverError, detectWebhookFormat, formatWebhookBody, type WebhookEnvelope } from "./formats";
import { enqueueAndDeliver, processDueDeliveries } from "./deliveries";

const DELIVERY_TIMEOUT_MS = 5_000;

export type TaskEvent =
  | { kind: "created"; taskId: string; title: string }
  | { kind: "status_changed"; taskId: string; title: string; status: string }
  | { kind: "completed"; taskId: string; title: string };

export interface DeliveryOutcome {
  status: number | null;
  error: string | null;
  /** A failure no retry can fix (refused URL, redirect) - see retry.ts. */
  permanent?: boolean;
}

function webBotAuthHeaders(url: URL): Record<string, string> {
  const key = signingKeyFromEnv();
  return key ? signRequest({ url: url.href, key, agentOrigin: SITE_URL }) : {};
}

/**
 * One POST, signed, with no redirects followed (a redirect could point back
 * at a private address the URL check already refused). The URL is checked
 * again here, not just when saved, because DNS can change in between.
 */
export async function deliverWebhook(
  target: Pick<WebhookTarget, "id" | "url" | "secret">,
  type: WebhookEventType | "ping",
  payload: Record<string, unknown>,
  // A queued delivery (deliveries.ts) keeps its id and created_at across
  // retries, so the receiver can tell a retry from a new event.
  identity?: { deliveryId: string; createdAt: string }
): Promise<DeliveryOutcome> {
  const urlCheck = await checkWebhookUrl(target.url, { allowPrivate: hasDirectDatabase() });
  if (!urlCheck.ok) return { status: null, error: urlCheck.reason, permanent: true };

  const deliveryId = identity?.deliveryId ?? randomUUID();
  const timestamp = Math.floor(Date.now() / 1000);
  const envelope = { id: deliveryId, type, created_at: identity?.createdAt ?? new Date(timestamp * 1000).toISOString(), ...payload };
  // Discord/Slack URLs get their native message shape (see formats.ts); the
  // signature headers are sent either way and cover whichever body goes out.
  const body = JSON.stringify(formatWebhookBody(detectWebhookFormat(target.url), envelope as WebhookEnvelope));

  try {
    const response = await guardedRequest(urlCheck.url, {
      method: "POST",
      timeoutMs: DELIVERY_TIMEOUT_MS,
      // Keep why the receiver refused - bounded, so a huge error page can't stall this.
      maxBytes: 2000,
      allowPrivate: hasDirectDatabase(),
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Guidon-Webhooks/1.0",
        "X-Guidon-Event": type,
        "X-Guidon-Delivery": deliveryId,
        "X-Guidon-Timestamp": String(timestamp),
        "X-Guidon-Signature": signWebhookPayload(target.secret, timestamp, body),
        // Web Bot Auth, when a key is configured: proves the request is Guidon's
        // to anyone who checks the key directory, without a shared secret.
        ...webBotAuthHeaders(urlCheck.url),
      },
      body,
    });
    if (response.status >= 300 && response.status < 400) {
      return { status: response.status, error: "Redirects are not followed - use the final URL.", permanent: true };
    }
    if (response.status >= 200 && response.status < 300) {
      return { status: response.status, error: null };
    }
    return { status: response.status, error: describeReceiverError(response.status, response.text) };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    const blocked = (error as { code?: string } | null)?.code === "EBLOCKED";
    return {
      status: null,
      error: timedOut
        ? `No response within ${DELIVERY_TIMEOUT_MS / 1000}s.`
        : blocked
          ? "That address isn't reachable from Guidon Cloud."
          : "Could not connect to the receiver.",
      permanent: blocked,
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
 * waits on third-party servers. Each delivery is queued (migration 089) and
 * tried at once; a failure is retried later (retry.ts) and shown in the
 * webhook's history. Due retries of earlier events go out here too, so they
 * don't wait only for the cron endpoint. Nothing is ever thrown.
 */
export function notifyOrganizationWebhooks(projectId: string, userId: string, event: TaskEvent): void {
  after(async () => {
    try {
      const found = await getWebhookTargetsForProject(projectId);
      if (found && found.targets.length > 0) {
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
            await enqueueAndDeliver(target, found.organizationId, type, {
              organization_id: found.organizationId,
              project: { id: projectId, name: found.projectName },
              actor_id: userId,
              data: { task },
            });
          })
        );
      }
      await processDueDeliveries(10);
    } catch (error) {
      console.error(`notifyOrganizationWebhooks(${event.kind}) failed:`, error);
    }
  });
}
