/**
 * Stripe webhook flow (src/lib/billing/stripe-webhook-core.ts) against an
 * in-memory store and a fake Stripe: duplicates, out-of-order delivery,
 * failed processing and retry, checkout/upgrade/downgrade/cancel, failed
 * payment and grace, unpaid checkouts, replaced subscriptions. Signatures
 * are checked with the real Stripe SDK, offline. No network, no payments.
 */
import assert from "node:assert/strict";
import Stripe from "stripe";

const { processStripeEvent, decideSubscriptionWrite, snapshotFromStripe, mapStripeStatus } = await import("../src/lib/billing/stripe-webhook-core.ts");
const { paymentState, GRACE_PERIOD_DAYS } = await import("../src/lib/billing/billing-core.ts");

let passed = 0;
async function test(name, run) { await run(); passed++; console.log(`pass ${name}`); }

const ORG = "org-1";
const DAY = 24 * 60 * 60 * 1000;
const PRICES = { "price_pro_month": { plan: "pro", interval: "month" }, "price_pro_year": { plan: "pro", interval: "year" }, "price_team_month": { plan: "team", interval: "month" } };
const PROJECT_LIMITS = { free: 3, pro: 20, team: 1000000 };

/** One organization's billing state plus what Stripe currently says about each subscription. */
function world({ billingColumns = true } = {}) {
  const state = {
    clock: new Date("2026-10-27T12:00:00Z"),
    claimed: new Set(),
    row: { organization_id: ORG, plan_id: "free", status: "active", stripe_subscription_id: null, ...(billingColumns ? { trial_used_at: null, past_due_since: null, billing_interval: null } : {}) },
    projectLimit: PROJECT_LIMITS.free,
    stripe: new Map(),
    writes: 0,
    logs: [],
    failNextSave: false,
    failRelease: false,
  };
  const deps = {
    async claimEvent(id) { if (state.claimed.has(id)) return false; state.claimed.add(id); return true; },
    async releaseEvent(id) { if (state.failRelease) throw new Error("release failed"); state.claimed.delete(id); },
    async retrieveSubscription(id) { const current = state.stripe.get(id); if (!current) throw new Error(`No such subscription: ${id}`); return snapshotFromStripe(structuredClone(current)); },
    async loadStored(org) {
      if (org !== ORG) return null;
      return { stripeSubscriptionId: state.row.stripe_subscription_id, status: state.row.status, trialUsedAt: state.row.trial_used_at ?? null, pastDueSince: state.row.past_due_since ?? null, hasBillingColumns: "trial_used_at" in state.row };
    },
    async planIdForPrice(price) { return PRICES[price]?.plan ?? "free"; },
    async saveSubscription(org, patch) {
      if (state.failNextSave) { state.failNextSave = false; throw new Error("database unavailable"); }
      if (org !== ORG) return 0;
      Object.assign(state.row, patch); state.writes++; return 1;
    },
    async syncProjectLimit(org, plan) { if (org === ORG) state.projectLimit = PROJECT_LIMITS[plan]; },
    log: (...args) => state.logs.push(args.map(String).join(" ")),
    now: () => state.clock,
  };
  let sequence = 0;
  /** Stripe changes the subscription, then (maybe later) sends an event about it. */
  function stripeSets(id, { status, price = "price_pro_month", cancelAtPeriodEnd = false, org = ORG }) {
    const start = Math.floor(state.clock.getTime() / 1000);
    state.stripe.set(id, {
      id, status, customer: "cus_1", cancel_at_period_end: cancelAtPeriodEnd, metadata: org ? { organization_id: org } : {},
      items: { data: [{ price: { id: price, recurring: { interval: PRICES[price]?.interval ?? "month", interval_count: 1 } }, current_period_start: start, current_period_end: start + 30 * 86400 }] },
    });
  }
  const event = (id, type = "customer.subscription.updated") => ({ id: `evt_${++sequence}`, type, data: { object: { id } } });
  const deliver = (evt) => processStripeEvent(evt, deps);
  return { state, deps, stripeSets, event, deliver };
}

await test("checkout with a trial: Pro, trial recorded once, monthly interval, project limit synced", async () => {
  const { state, stripeSets, event, deliver } = world();
  stripeSets("sub_1", { status: "trialing" });
  assert.deepEqual((await deliver(event("sub_1", "customer.subscription.created"))).body, { ok: true });
  assert.equal(state.row.plan_id, "pro");
  assert.equal(state.row.status, "trialing");
  assert.equal(state.row.billing_interval, "month");
  assert.equal(state.row.trial_used_at, state.clock.toISOString());
  assert.equal(state.projectLimit, PROJECT_LIMITS.pro);
  const firstTrial = state.row.trial_used_at;
  state.clock = new Date(state.clock.getTime() + 14 * DAY);
  stripeSets("sub_1", { status: "active" });
  await deliver(event("sub_1"));
  assert.equal(state.row.status, "active");
  assert.equal(state.row.trial_used_at, firstTrial, "the trial date is never moved or cleared");
});

await test("a redelivered event has one effect", async () => {
  const { state, stripeSets, event, deliver } = world();
  stripeSets("sub_1", { status: "active" });
  const evt = event("sub_1", "customer.subscription.created");
  await deliver(evt);
  const again = await deliver(evt);
  assert.deepEqual(again.body, { ok: true, deduped: true });
  assert.equal(state.writes, 1);
});

await test("out-of-order delivery: an older event arriving last still leaves Stripe's current state", async () => {
  const { state, stripeSets, event, deliver } = world();
  stripeSets("sub_1", { status: "active", price: "price_pro_month" });
  const created = event("sub_1", "customer.subscription.created");
  stripeSets("sub_1", { status: "active", price: "price_team_month" });
  const upgraded = event("sub_1");
  await deliver(upgraded);
  await deliver(created);
  assert.equal(state.row.plan_id, "team", "the late 'created' doesn't roll the upgrade back");
  assert.equal(state.projectLimit, PROJECT_LIMITS.team);
});

await test("upgrade, yearly switch and downgrade follow the price; limits follow the plan", async () => {
  const { state, stripeSets, event, deliver } = world();
  for (const [price, plan, interval] of [["price_pro_month", "pro", "month"], ["price_team_month", "team", "month"], ["price_pro_year", "pro", "year"]]) {
    stripeSets("sub_1", { status: "active", price });
    await deliver(event("sub_1"));
    assert.equal(state.row.plan_id, plan);
    assert.equal(state.row.billing_interval, interval);
    assert.equal(state.projectLimit, PROJECT_LIMITS[plan]);
  }
  stripeSets("sub_1", { status: "active", price: "price_unknown" });
  await deliver(event("sub_1"));
  assert.equal(state.row.plan_id, "free", "a price that maps to no plan never grants one");
});

await test("cancel at period end keeps the plan; deletion falls back to Free", async () => {
  const { state, stripeSets, event, deliver } = world();
  stripeSets("sub_1", { status: "active" });
  await deliver(event("sub_1"));
  stripeSets("sub_1", { status: "active", cancelAtPeriodEnd: true });
  await deliver(event("sub_1"));
  assert.equal(state.row.plan_id, "pro");
  assert.equal(state.row.cancel_at_period_end, true);
  stripeSets("sub_1", { status: "canceled", cancelAtPeriodEnd: true });
  await deliver(event("sub_1", "customer.subscription.deleted"));
  assert.equal(state.row.plan_id, "free");
  assert.equal(state.row.status, "canceled");
  assert.equal(state.row.cancel_at_period_end, false);
  assert.equal(state.projectLimit, PROJECT_LIMITS.free);
});

await test("failed renewal: grace keeps the plan for the grace period, then Free's limits; paying clears it", async () => {
  const { state, stripeSets, event, deliver } = world();
  stripeSets("sub_1", { status: "active" });
  await deliver(event("sub_1"));
  stripeSets("sub_1", { status: "past_due" });
  await deliver(event("sub_1"));
  const since = state.row.past_due_since;
  assert.equal(state.row.plan_id, "pro");
  assert.equal(state.row.status, "past_due");
  assert.equal(since, state.clock.toISOString());
  assert.equal(paymentState(state.row.status, since, state.clock).kind, "grace");
  state.clock = new Date(state.clock.getTime() + 3 * DAY);
  stripeSets("sub_1", { status: "unpaid" });
  await deliver(event("sub_1"));
  assert.equal(state.row.past_due_since, since, "a later failure doesn't restart the grace period");
  assert.equal(paymentState(state.row.status, since, new Date(Date.parse(since) + (GRACE_PERIOD_DAYS + 1) * DAY)).kind, "suspended");
  stripeSets("sub_1", { status: "active" });
  await deliver(event("sub_1"));
  assert.equal(state.row.past_due_since, null);
  assert.equal(paymentState(state.row.status, state.row.past_due_since, state.clock).kind, "ok");
});

await test("no plan without payment: incomplete and paused subscriptions keep Free", async () => {
  for (const status of ["incomplete", "paused", "something_new"]) {
    const { state, stripeSets, event, deliver } = world();
    stripeSets("sub_1", { status });
    await deliver(event("sub_1", "customer.subscription.created"));
    assert.equal(state.row.plan_id, "free", status);
    assert.equal(state.projectLimit, PROJECT_LIMITS.free, status);
  }
  const { state, stripeSets, event, deliver } = world();
  stripeSets("sub_1", { status: "incomplete" });
  await deliver(event("sub_1", "customer.subscription.created"));
  stripeSets("sub_1", { status: "active" });
  await deliver(event("sub_1"));
  assert.equal(state.row.plan_id, "pro", "the plan starts once the first payment goes through");
});

await test("a late event about a replaced subscription doesn't touch the new one", async () => {
  const { state, stripeSets, event, deliver } = world();
  stripeSets("sub_old", { status: "active" });
  await deliver(event("sub_old"));
  stripeSets("sub_old", { status: "canceled" });
  const oldDeleted = event("sub_old", "customer.subscription.deleted");
  stripeSets("sub_new", { status: "active", price: "price_team_month" });
  await deliver(event("sub_new", "customer.subscription.created"));
  const late = await deliver(oldDeleted);
  assert.deepEqual(late.body, { ok: true, ignored: "replaced-subscription" });
  assert.equal(state.row.stripe_subscription_id, "sub_new");
  assert.equal(state.row.plan_id, "team");
  assert.equal(state.projectLimit, PROJECT_LIMITS.team);
});

await test("a failure releases the event so Stripe's retry is processed, once", async () => {
  const { state, stripeSets, event, deliver } = world();
  stripeSets("sub_1", { status: "active" });
  const evt = event("sub_1", "customer.subscription.created");
  state.failNextSave = true;
  const failed = await deliver(evt);
  assert.equal(failed.status, 500);
  assert.equal(state.row.plan_id, "free");
  assert.equal(state.claimed.has(evt.id), false, "released for the retry");
  assert.ok(state.logs.some((line) => line.includes("database unavailable")));
  assert.deepEqual((await deliver(evt)).body, { ok: true });
  assert.equal(state.row.plan_id, "pro");
  assert.deepEqual((await deliver(evt)).body, { ok: true, deduped: true });
  assert.equal(state.writes, 1);
});

await test("Stripe unreachable is a failure too; a failed release is logged and still answers 500", async () => {
  const { state, event, deliver } = world();
  const missing = await deliver(event("sub_unknown"));
  assert.equal(missing.status, 500);
  state.failRelease = true;
  const evt = event("sub_unknown");
  assert.equal((await deliver(evt)).status, 500);
  assert.ok(state.logs.some((line) => line.includes("could not release")));
});

await test("ignored: other event types (not claimed), subscriptions without organization, unknown organizations", async () => {
  const { state, stripeSets, event, deliver } = world();
  const invoice = { id: "evt_invoice", type: "invoice.payment_failed", data: { object: { id: "in_1" } } };
  assert.deepEqual((await deliver(invoice)).body, { ok: true, ignored: "event type" });
  assert.equal(state.claimed.has("evt_invoice"), false);
  stripeSets("sub_1", { status: "active", org: null });
  assert.deepEqual((await deliver(event("sub_1"))).body, { ok: true, ignored: "no organization" });
  stripeSets("sub_2", { status: "active", org: "org-deleted" });
  assert.deepEqual((await deliver(event("sub_2"))).body, { ok: true, ignored: "no subscription row" });
  assert.equal(state.writes, 0);
  assert.equal(state.row.plan_id, "free");
});

await test("databases before migration 071 get no billing columns written", async () => {
  const { state, stripeSets, event, deliver } = world({ billingColumns: false });
  stripeSets("sub_1", { status: "trialing" });
  await deliver(event("sub_1"));
  assert.equal(state.row.plan_id, "pro");
  assert.equal("trial_used_at" in state.row, false);
  assert.equal("billing_interval" in state.row, false);
});

await test("status mapping never grants access for an unknown status", () => {
  assert.equal(mapStripeStatus("active"), "active");
  assert.equal(mapStripeStatus("incomplete_expired"), "canceled");
  assert.equal(mapStripeStatus("brand_new_status"), "past_due");
  const decision = decideSubscriptionWrite({ id: "s", organizationId: ORG, customerId: "c", status: "brand_new_status", priceId: "price_pro_month", interval: "month", intervalCount: 1, periodStart: null, periodEnd: null, cancelAtPeriodEnd: false }, null, "pro", new Date());
  assert.equal(decision.kind === "write" && decision.planId, "free");
});

await test("signatures (Stripe SDK, offline): valid, tampered body, wrong secret, replayed old timestamp", () => {
  const stripe = new Stripe("sk_test_offline_only");
  const secret = "whsec_test_only";
  const payload = JSON.stringify({ id: "evt_sig", object: "event", type: "customer.subscription.updated", data: { object: { id: "sub_1" } } });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
  assert.equal(stripe.webhooks.constructEvent(payload, header, secret).id, "evt_sig");
  assert.throws(() => stripe.webhooks.constructEvent(payload.replace("sub_1", "sub_2"), header, secret));
  assert.throws(() => stripe.webhooks.constructEvent(payload, header, "whsec_other"));
  const old = stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp: Math.floor(Date.now() / 1000) - 3600 });
  assert.throws(() => stripe.webhooks.constructEvent(payload, old, secret), /tolerance/i);
});

console.log(`${passed} Stripe webhook tests passed`);
