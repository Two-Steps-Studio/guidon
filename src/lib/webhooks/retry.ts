// No imports: tests/webhooks.test.mjs loads this file with Node's type stripping.

/**
 * When a webhook delivery is tried again (src/lib/webhooks/deliveries.ts,
 * migration 089). The first attempt is immediate; after a failure that a
 * retry can fix the next one waits 1 min, 5 min, 30 min, 2 h, then 12 h -
 * six attempts over about 15 hours - before the delivery is marked failed.
 */
export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 12 * 3_600_000] as const;
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

export interface AttemptOutcome {
  /** HTTP status of the receiver's answer, null when there was none. */
  status: number | null;
  error: string | null;
  /** A failure no retry can fix: the URL is refused, a redirect, most 4xx. */
  permanent?: boolean;
}

/**
 * Worth retrying: no answer at all (network, timeout), 408, 429 and 5xx. Any
 * other 4xx means the receiver rejected the request itself (wrong URL, auth,
 * validation) - sending the same bytes again won't change that.
 */
export function isRetriable(outcome: AttemptOutcome): boolean {
  if (outcome.permanent) return false;
  if (outcome.status === null) return true;
  return outcome.status === 408 || outcome.status === 429 || outcome.status >= 500;
}

export type DeliveryState =
  | { status: "succeeded"; next_attempt_at: null }
  | { status: "failed"; next_attempt_at: null }
  | { status: "pending"; next_attempt_at: string };

/** State after attempt number `attempts` (1-based) ended with `outcome`. */
export function stateAfterAttempt(attempts: number, outcome: AttemptOutcome, now: Date): DeliveryState {
  if (outcome.error === null && outcome.status !== null && outcome.status >= 200 && outcome.status < 300) {
    return { status: "succeeded", next_attempt_at: null };
  }
  if (!isRetriable(outcome) || attempts >= MAX_ATTEMPTS) return { status: "failed", next_attempt_at: null };
  const delay = RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)];
  return { status: "pending", next_attempt_at: new Date(now.getTime() + delay).toISOString() };
}

/** How long a claimed delivery stays reserved for one worker before another may take it. */
export const CLAIM_LEASE_MS = 2 * 60_000;
