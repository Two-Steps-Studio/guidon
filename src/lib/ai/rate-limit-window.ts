import "server-only";

/**
 * Generic in-memory, per-process sliding-window counter, factored out of
 * chat-rate-limit.ts so every Server Action that makes a real, billed LLM
 * call can get the same cost-bounding throttle without re-implementing the
 * Map/window bookkeeping. Same documented limitation as
 * src/lib/auth/rate-limit.ts and src/lib/api/rate-limit.ts: resets on
 * restart, doesn't share state across replicas - acceptable for this
 * project's actual deployment shape today (one `app` container).
 */
export function createRateLimitWindow(maxCount: number, windowMs: number) {
  type Window = { count: number; windowStart: number };
  const windows = new Map<string, Window>();

  function isExpired(entry: Window): boolean {
    return Date.now() - entry.windowStart > windowMs;
  }

  return {
    isLimited(key: string): boolean {
      const entry = windows.get(key);
      if (!entry) return false;

      if (isExpired(entry)) {
        windows.delete(key);
        return false;
      }

      return entry.count >= maxCount;
    },

    record(key: string): void {
      const entry = windows.get(key);

      if (!entry || isExpired(entry)) {
        windows.set(key, { count: 1, windowStart: Date.now() });
        return;
      }

      entry.count += 1;
    },
  };
}
