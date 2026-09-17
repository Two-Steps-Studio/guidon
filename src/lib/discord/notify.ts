import "server-only";

import { after } from "next/server";
import { getDiscordWebhookUrl } from "@/lib/data/discord-integration";
import { SITE_URL } from "@/lib/site-url";

export type DiscordTaskEvent =
  | { kind: "created"; taskId: string; title: string }
  | { kind: "status_changed"; taskId: string; title: string; status: string }
  | { kind: "completed"; taskId: string; title: string };

const EVENT_COLOR: Record<DiscordTaskEvent["kind"], number> = {
  created: 0x3b82f6, // blue
  status_changed: 0xf59e0b, // amber
  completed: 0x22c55e, // green
};

function describe(event: DiscordTaskEvent): string {
  switch (event.kind) {
    case "created":
      return "New task created";
    case "status_changed":
      return `Task moved to **${event.status}**`;
    case "completed":
      return "Task completed";
  }
}

/**
 * Posts a task-event notification to the project's configured Discord
 * webhook, if any. Runs inside next/server's `after()` (same pattern as
 * logActivity, src/lib/data/log-activity.ts) so callers never await a
 * webhook lookup + Discord round trip before their own response can return
 * - a missing/unconfigured webhook is the overwhelmingly common case (most
 * projects have none), and even a configured one shouldn't add latency to
 * the task action that triggered it. Best-effort: failures are logged, not
 * thrown - a Discord outage must never break the underlying task mutation,
 * which has already committed by the time this runs.
 */
export function notifyDiscordTaskEvent(projectId: string, userId: string, event: DiscordTaskEvent): void {
  after(async () => {
    try {
      const webhookUrl = await getDiscordWebhookUrl(projectId, userId);
      if (!webhookUrl) return;

      const taskUrl = `${SITE_URL}/projects/${projectId}/work`;

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          embeds: [
            {
              title: event.title,
              description: describe(event),
              url: taskUrl,
              color: EVENT_COLOR[event.kind],
              footer: { text: "Guidon" },
              timestamp: new Date().toISOString(),
            },
          ],
        }),
      });

      if (!response.ok) {
        console.error(`notifyDiscordTaskEvent(${event.kind}) failed: Discord returned ${response.status}`);
      }
    } catch (error) {
      console.error(`notifyDiscordTaskEvent(${event.kind}) failed:`, error);
    }
  });
}
