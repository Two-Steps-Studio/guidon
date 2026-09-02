import "server-only";

import { createRateLimitWindow } from "./rate-limit-window";

/**
 * Per-user, per-project throttle for the AI task chat (ai-chat-actions.ts).
 * Unlike the AI Task API's rate-limit.ts (60 requests/min, tuned for
 * programmatic API-key traffic), every message here is a real LLM call
 * billed against the org's configured key (or the instance-wide one) -
 * with no throttle at all, any project member with write access could run
 * up real cost as fast as the UI allows, or against a hostile/scripted
 * client that skips the UI entirely and calls the Server Action directly.
 * 20 messages/5 minutes comfortably covers a genuinely fast back-and-forth
 * conversation while bounding worst-case cost.
 */

const MAX_MESSAGES = 20;
const WINDOW_MS = 5 * 60 * 1000;

const window = createRateLimitWindow(MAX_MESSAGES, WINDOW_MS);

export function isChatRateLimited(userId: string, projectId: string): boolean {
  return window.isLimited(`${userId}:${projectId}`);
}

export function recordChatMessage(userId: string, projectId: string): void {
  window.record(`${userId}:${projectId}`);
}
