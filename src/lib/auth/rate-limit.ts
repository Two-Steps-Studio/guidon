import "server-only";

/**
 * Failed-attempt lockout for self-hosted sign-in (TODO.md §29 security
 * audit finding: signInLocal had no throttle at all — scrypt's per-attempt
 * CPU cost slows brute-forcing but is not a substitute for a lockout).
 *
 * In-memory, per-process, keyed by normalized email. That is a deliberate,
 * documented limitation, not an oversight: it resets on restart and does not
 * share state across horizontally-scaled replicas. Both are acceptable for
 * this project's actual deployment shape today — docker-compose.yml runs
 * exactly one `app` container — and a durable version would need a database
 * table, which is a schema change requiring explicit confirmation per this
 * repo's CLAUDE.md rules, not something to add silently while fixing a
 * different bug. If self-hosted Guidon ever runs multiple app replicas
 * behind a load balancer, this needs to move to a shared store.
 */

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

type Attempt = { count: number; windowStart: number };

const attempts = new Map<string, Attempt>();

function isExpired(entry: Attempt): boolean {
  return Date.now() - entry.windowStart > WINDOW_MS;
}

export function isLockedOut(key: string): boolean {
  const entry = attempts.get(key);
  if (!entry) return false;

  if (isExpired(entry)) {
    attempts.delete(key);
    return false;
  }

  return entry.count >= MAX_ATTEMPTS;
}

export function recordFailedAttempt(key: string): void {
  const entry = attempts.get(key);

  if (!entry || isExpired(entry)) {
    attempts.set(key, { count: 1, windowStart: Date.now() });
    return;
  }

  entry.count += 1;
}

export function clearAttempts(key: string): void {
  attempts.delete(key);
}
