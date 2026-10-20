import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyDiscordTaskEvent } from "@/lib/discord/notify";
import { notifyOrganizationWebhooks, type TaskEvent } from "@/lib/webhooks/dispatch";
import { learnFromCompletedTask } from "@/lib/ai/task-learning";

export type { TaskEvent } from "@/lib/webhooks/dispatch";

/**
 * Fans a task event out to every integration: the project's Discord webhook
 * and the organization's webhooks - and, for a finished task, the AI that
 * proposes what to remember from it (lib/ai/task-learning.ts). All run in
 * after() and never throw.
 * `client` is only needed by the Discord lookup - see notifyDiscordTaskEvent.
 */
export function emitTaskEvent(projectId: string, userId: string, event: TaskEvent, client?: SupabaseClient): void {
  notifyDiscordTaskEvent(projectId, userId, event, client);
  notifyOrganizationWebhooks(projectId, userId, event);
  if (event.kind === "completed") learnFromCompletedTask(projectId, userId, event.taskId);
}
