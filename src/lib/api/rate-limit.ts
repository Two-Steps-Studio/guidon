import "server-only";

/**
 * Per-API-key request rate limit. In-memory, per-process - same
 * documented limitation as src/lib/auth/rate-limit.ts (resets on restart,
 * doesn't share state across replicas); this deployment runs one `app`
 * container (docker-compose.yml), so that's acceptable today. A
 * multi-replica deployment needs a shared store instead.
 */

const MAX_REQUESTS = 60;
export const RATE_LIMIT_WINDOW_SECONDS = 60;
const WINDOW_MS = RATE_LIMIT_WINDOW_SECONDS * 1000;

type Window = { count: number; windowStart: number };

const windows = new Map<string, Window>();

function isExpired(entry: Window): boolean {
  return Date.now() - entry.windowStart > WINDOW_MS;
}

export function isRateLimited(apiKeyId: string): boolean {
  const entry = windows.get(apiKeyId);
  if (!entry) return false;

  if (isExpired(entry)) {
    windows.delete(apiKeyId);
    return false;
  }

  return entry.count >= MAX_REQUESTS;
}

export function recordRequest(apiKeyId: string): void {
  const entry = windows.get(apiKeyId);

  if (!entry || isExpired(entry)) {
    windows.set(apiKeyId, { count: 1, windowStart: Date.now() });
    return;
  }

  entry.count += 1;
}

/** Where this key stands in its window - for the RateLimit response headers. */
export function rateLimitStatus(apiKeyId: string): { limit: number; remaining: number; resetSeconds: number } {
  const entry = windows.get(apiKeyId);
  if (!entry || isExpired(entry)) return { limit: MAX_REQUESTS, remaining: MAX_REQUESTS, resetSeconds: RATE_LIMIT_WINDOW_SECONDS };
  return {
    limit: MAX_REQUESTS,
    remaining: Math.max(0, MAX_REQUESTS - entry.count),
    resetSeconds: Math.max(0, (entry.windowStart + WINDOW_MS - Date.now()) / 1000),
  };
}
