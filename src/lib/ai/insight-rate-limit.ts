import "server-only";

import { createRateLimitWindow } from "./rate-limit-window";

/**
 * Per-user, per-project throttle for generateInsight (memory/actions.ts).
 * Same reasoning as chat-rate-limit.ts - this is a real LLM call billed
 * against the org's configured key, and was previously the only
 * provider.complete() call site in the app with no throttle at all. A
 * tighter budget than chat's 20/5min: each call is a single one-shot
 * request rather than a back-and-forth conversation, so there's no
 * legitimate reason to fire it more than a handful of times in a row.
 */

const MAX_INSIGHTS = 8;
const WINDOW_MS = 5 * 60 * 1000;

const window = createRateLimitWindow(MAX_INSIGHTS, WINDOW_MS);

export function isInsightRateLimited(userId: string, projectId: string): boolean {
  return window.isLimited(`${userId}:${projectId}`);
}

export function recordInsightGeneration(userId: string, projectId: string): void {
  window.record(`${userId}:${projectId}`);
}
