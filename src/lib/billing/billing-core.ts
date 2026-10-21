/**
 * Billing rules with no I/O (migration 071): billing intervals, the
 * once-per-organization trial and the grace period after a failed payment.
 * No imports, so tests/billing.test.mjs runs it with Node's type stripping.
 */

export const BILLING_INTERVALS = ["week", "month", "year"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

/** Trial length of a first paid subscription - no card needed, once per organization. */
export const TRIAL_PERIOD_DAYS = 14;

/**
 * How long a past_due subscription keeps its plan while Stripe retries the
 * payment. After that the organization gets Free's limits until a payment
 * goes through (nothing is deleted - over-limit data stays, only adding
 * more is blocked, as with a downgrade).
 */
export const GRACE_PERIOD_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export function isBillingInterval(value: unknown): value is BillingInterval {
  return typeof value === "string" && (BILLING_INTERVALS as readonly string[]).includes(value);
}

/** Stripe's recurring.interval ('day' | 'week' | 'month' | 'year') in Guidon's vocabulary; null for anything else. */
export function intervalFromStripe(interval: string | null | undefined, intervalCount = 1): BillingInterval | null {
  if (intervalCount !== 1) return null;
  return isBillingInterval(interval) ? interval : null;
}

/** subscriptions.past_due_since after a sync: kept while still past_due, started on entering it, cleared on leaving. */
export function nextPastDueSince(status: string, previous: string | null, now: Date): string | null {
  if (status !== "past_due") return null;
  return previous ?? now.toISOString();
}

/** subscriptions.trial_used_at after a sync: set the first time the organization is seen trialing, never cleared. */
export function nextTrialUsedAt(status: string, previous: string | null, now: Date): string | null {
  if (previous) return previous;
  return status === "trialing" ? now.toISOString() : null;
}

export function canStartTrial(trialUsedAt: string | null | undefined): boolean {
  return !trialUsedAt;
}

export function graceEndsAt(pastDueSince: string | null | undefined): Date | null {
  if (!pastDueSince) return null;
  const start = new Date(pastDueSince).getTime();
  if (Number.isNaN(start)) return null;
  return new Date(start + GRACE_PERIOD_DAYS * DAY_MS);
}

export type PaymentState =
  | { kind: "ok" }
  /** Payment failed, the plan still counts until `graceEndsAt`. */
  | { kind: "grace"; graceEndsAt: Date }
  /** Grace is over: Free's limits apply until a payment goes through. */
  | { kind: "suspended"; since: Date };

export function paymentState(status: string | null | undefined, pastDueSince: string | null | undefined, now: Date): PaymentState {
  if (status !== "past_due") return { kind: "ok" };
  // past_due with no date (a row from before 071's backfill, or a webhook
  // that hasn't run yet): grace starts now rather than suspending at once.
  const ends = graceEndsAt(pastDueSince) ?? new Date(now.getTime() + GRACE_PERIOD_DAYS * DAY_MS);
  return now.getTime() < ends.getTime() ? { kind: "grace", graceEndsAt: ends } : { kind: "suspended", since: ends };
}

/** Whole percent saved by paying yearly instead of 12 monthly payments; 0 when there's no saving. */
export function yearlySavingsPercent(monthCents: number, yearCents: number): number {
  if (monthCents <= 0 || yearCents <= 0) return 0;
  const saving = 1 - yearCents / (monthCents * 12);
  return saving > 0 ? Math.round(saving * 100) : 0;
}
