import { intervalFromStripe, nextPastDueSince, nextTrialUsedAt } from "./billing-core";

/**
 * The Stripe webhook's decisions, with every side effect injected
 * (src/app/api/stripe/webhook/route.ts wires Supabase and the Stripe API;
 * tests/billing-webhook.test.mjs wires an in-memory store). Three rules
 * this keeps that a plain "write what the event says" handler breaks:
 *
 * - **At least once, exactly one effect.** An event id is claimed before
 *   it is handled and released again if handling fails, so Stripe's retry
 *   is processed instead of being dropped as a duplicate.
 * - **No ordering assumptions.** Stripe doesn't deliver in order. Each
 *   event re-reads the subscription from Stripe and writes its current
 *   state, and an event about a subscription the organization has since
 *   replaced never touches the newer one.
 * - **No plan without payment.** `incomplete` (checkout not paid yet) and
 *   `paused` keep Free's limits; only `past_due` (a renewal that failed
 *   after paying before) gets the grace period.
 */

export type StripeStatus = "trialing" | "active" | "past_due" | "unpaid" | "canceled" | "incomplete" | "incomplete_expired" | "paused" | string;
export type GuidonStatus = "active" | "trialing" | "past_due" | "canceled";

/** What the handler needs from a Stripe subscription - built by `snapshotFromStripe`. */
export type SubscriptionSnapshot = {
  id: string;
  organizationId: string | null;
  customerId: string;
  status: StripeStatus;
  priceId: string | null;
  interval: string | null;
  intervalCount: number;
  periodStart: number | null;
  periodEnd: number | null;
  cancelAtPeriodEnd: boolean;
};

/** The organization's `subscriptions` row as far as the handler cares; `hasBillingColumns` is false before migration 071. */
export type StoredSubscription = {
  stripeSubscriptionId: string | null;
  status: string | null;
  trialUsedAt: string | null;
  pastDueSince: string | null;
  hasBillingColumns: boolean;
};

export type SubscriptionPatch = {
  plan_id: string;
  status: GuidonStatus;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  current_period_start?: string;
  current_period_end?: string;
  cancel_at_period_end: boolean;
  billing_interval?: string | null;
  trial_used_at?: string | null;
  past_due_since?: string | null;
};

type StripeLikeSubscription = {
  id: string;
  status: string;
  customer: string | { id: string };
  cancel_at_period_end: boolean;
  metadata?: Record<string, string> | null;
  items: { data: { price?: { id: string; recurring?: { interval?: string; interval_count?: number } | null } | null; current_period_start?: number; current_period_end?: number }[] };
};

export function snapshotFromStripe(subscription: StripeLikeSubscription): SubscriptionSnapshot {
  const item = subscription.items.data[0];
  return {
    id: subscription.id,
    organizationId: subscription.metadata?.organization_id || null,
    customerId: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
    status: subscription.status,
    priceId: item?.price?.id ?? null,
    interval: item?.price?.recurring?.interval ?? null,
    intervalCount: item?.price?.recurring?.interval_count ?? 1,
    periodStart: item?.current_period_start ?? null,
    periodEnd: item?.current_period_end ?? null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  };
}

/** Guidon's vocabulary (015's CHECK) is narrower than Stripe's; anything unknown never counts as paid. */
export function mapStripeStatus(status: StripeStatus): GuidonStatus {
  switch (status) {
    case "trialing": return "trialing";
    case "active": return "active";
    case "canceled":
    case "incomplete_expired": return "canceled";
    default: return "past_due";
  }
}

/** Whether this Stripe status may carry the paid plan (grace included). */
export function grantsPlan(status: StripeStatus): boolean {
  return status === "trialing" || status === "active" || status === "past_due" || status === "unpaid";
}

export type Decision =
  | { kind: "skip"; reason: "no-organization" | "replaced-subscription" }
  | { kind: "write"; planId: string; patch: SubscriptionPatch };

/**
 * The row for the subscription's current state. `pricePlanId` is the plan
 * its price maps to (plan_prices, then plans.stripe_price_id, else free).
 */
export function decideSubscriptionWrite(snapshot: SubscriptionSnapshot, stored: StoredSubscription | null, pricePlanId: string, now: Date): Decision {
  if (!snapshot.organizationId) return { kind: "skip", reason: "no-organization" };
  const ended = mapStripeStatus(snapshot.status) === "canceled";
  // A different subscription is on file: a late event about the old one
  // must not undo the new one. A new, live subscription replaces it.
  if (stored?.stripeSubscriptionId && stored.stripeSubscriptionId !== snapshot.id && (ended || !grantsPlan(snapshot.status))) {
    return { kind: "skip", reason: "replaced-subscription" };
  }
  const status = mapStripeStatus(snapshot.status);
  const planId = ended || !grantsPlan(snapshot.status) ? "free" : pricePlanId;
  const patch: SubscriptionPatch = {
    plan_id: planId,
    status,
    stripe_customer_id: snapshot.customerId,
    stripe_subscription_id: snapshot.id,
    cancel_at_period_end: ended ? false : snapshot.cancelAtPeriodEnd,
  };
  if (snapshot.periodStart !== null) patch.current_period_start = new Date(snapshot.periodStart * 1000).toISOString();
  if (snapshot.periodEnd !== null) patch.current_period_end = new Date(snapshot.periodEnd * 1000).toISOString();
  if (stored?.hasBillingColumns) {
    patch.billing_interval = intervalFromStripe(snapshot.interval, snapshot.intervalCount);
    patch.trial_used_at = nextTrialUsedAt(status, stored.trialUsedAt, now);
    patch.past_due_since = nextPastDueSince(status, stored.pastDueSince, now);
  }
  return { kind: "write", planId, patch };
}

export type WebhookDeps = {
  /** Claims the event id; false when it was already claimed (a redelivery). */
  claimEvent(eventId: string, eventType: string): Promise<boolean>;
  /** Releases a claim so Stripe's retry is processed. */
  releaseEvent(eventId: string): Promise<void>;
  /** The subscription as Stripe has it now (not as the event saw it). */
  retrieveSubscription(subscriptionId: string): Promise<SubscriptionSnapshot>;
  loadStored(organizationId: string): Promise<StoredSubscription | null>;
  planIdForPrice(priceId: string): Promise<string>;
  /** Writes the row; the number of rows it matched. */
  saveSubscription(organizationId: string, patch: SubscriptionPatch): Promise<number>;
  syncProjectLimit(organizationId: string, planId: string): Promise<void>;
  log(message: string, ...details: unknown[]): void;
  now(): Date;
};

export const HANDLED_EVENTS = ["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"] as const;

export type WebhookOutcome = { status: 200; body: { ok: true; deduped?: true; ignored?: string } } | { status: 500; body: { error: string } };

/** One verified event, start to finish. */
export async function processStripeEvent(event: { id: string; type: string; data: { object: unknown } }, deps: WebhookDeps): Promise<WebhookOutcome> {
  if (!(HANDLED_EVENTS as readonly string[]).includes(event.type)) return { status: 200, body: { ok: true, ignored: "event type" } };
  if (!(await deps.claimEvent(event.id, event.type))) return { status: 200, body: { ok: true, deduped: true } };
  try {
    const subscriptionId = (event.data.object as { id?: unknown } | null)?.id;
    if (typeof subscriptionId !== "string" || !subscriptionId) throw new Error("Event has no subscription id");
    const snapshot = await deps.retrieveSubscription(subscriptionId);
    if (!snapshot.organizationId) {
      deps.log("[Stripe webhook] subscription has no organization_id metadata - ignoring", snapshot.id);
      return { status: 200, body: { ok: true, ignored: "no organization" } };
    }
    const stored = await deps.loadStored(snapshot.organizationId);
    const pricePlanId = snapshot.priceId ? await deps.planIdForPrice(snapshot.priceId) : "free";
    const decision = decideSubscriptionWrite(snapshot, stored, pricePlanId, deps.now());
    if (decision.kind === "skip") return { status: 200, body: { ok: true, ignored: decision.reason } };
    const matched = await deps.saveSubscription(snapshot.organizationId, decision.patch);
    // Service-role write, no RLS backstop: no row means a deleted organization or stale metadata.
    if (!matched) {
      deps.log("[Stripe webhook] subscriptions update matched no row for organization_id", snapshot.organizationId);
      return { status: 200, body: { ok: true, ignored: "no subscription row" } };
    }
    await deps.syncProjectLimit(snapshot.organizationId, decision.planId);
    return { status: 200, body: { ok: true } };
  } catch (error) {
    deps.log("[Stripe webhook]", event.type, error);
    // Every write above is "set to the current state", so processing the retry again is safe.
    try { await deps.releaseEvent(event.id); } catch (release) { deps.log("[Stripe webhook] could not release", event.id, release); }
    return { status: 500, body: { error: "Failed to process event." } };
  }
}
