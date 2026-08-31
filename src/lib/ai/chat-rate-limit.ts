import "server-only";

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
 *
 * In-memory, per-process - same documented limitation as
 * src/lib/auth/rate-limit.ts and src/lib/api/rate-limit.ts: resets on
 * restart, doesn't share state across replicas. Acceptable for this
 * project's actual deployment shape today (one `app` container); a
 * multi-replica deployment needs a shared store instead.
 */

const MAX_MESSAGES = 20;
const WINDOW_MS = 5 * 60 * 1000;

type Window = { count: number; windowStart: number };

const windows = new Map<string, Window>();

function isExpired(entry: Window): boolean {
  return Date.now() - entry.windowStart > WINDOW_MS;
}

export function isChatRateLimited(userId: string, projectId: string): boolean {
  const entry = windows.get(`${userId}:${projectId}`);
  if (!entry) return false;

  if (isExpired(entry)) {
    windows.delete(`${userId}:${projectId}`);
    return false;
  }

  return entry.count >= MAX_MESSAGES;
}

export function recordChatMessage(userId: string, projectId: string): void {
  const key = `${userId}:${projectId}`;
  const entry = windows.get(key);

  if (!entry || isExpired(entry)) {
    windows.set(key, { count: 1, windowStart: Date.now() });
    return;
  }

  entry.count += 1;
}
