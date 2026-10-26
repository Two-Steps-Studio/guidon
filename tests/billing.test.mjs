/**
 * Billing rules (src/lib/billing/billing-core.ts, migration 071): intervals,
 * once-per-organization trial, grace period after a failed payment.
 * billing-core.ts has no imports, so Node's built-in type stripping runs it.
 */
import {
  GRACE_PERIOD_DAYS,
  canStartTrial,
  graceEndsAt,
  intervalFromStripe,
  isBillingInterval,
  nextPastDueSince,
  nextTrialUsedAt,
  paymentState,
  yearlySavingsPercent,
} from "../src/lib/billing/billing-core.ts";
import { buildPriceSync, planForProduct, priceSyncWrites } from "../src/lib/billing/price-sync-core.ts";

let pass = 0;
let fail = 0;
function check(label, ok, detail = "") {
  if (ok) {
    pass++;
    console.log(`    pass  ${label}`);
  } else {
    fail++;
    console.log(`    FAIL  ${label}${detail ? `  -> ${detail}` : ""}`);
  }
}
function section(title) {
  console.log(`\n  ${title}`);
}

const now = new Date("2026-10-21T12:00:00Z");
const day = 24 * 60 * 60 * 1000;

section("intervals");
check("week/month/year are intervals", ["week", "month", "year"].every(isBillingInterval));
check("day is not", !isBillingInterval("day"));
check("Stripe month -> month", intervalFromStripe("month") === "month");
check("Stripe every 3 months -> not a Guidon interval", intervalFromStripe("month", 3) === null);
check("Stripe day -> null", intervalFromStripe("day") === null);
check("missing -> null", intervalFromStripe(undefined) === null);

section("trial once per organization");
check("never trialed -> can start", canStartTrial(null));
check("trialed before -> cannot", !canStartTrial("2026-01-01T00:00:00Z"));
const firstTrial = nextTrialUsedAt("trialing", null, now);
check("first trialing sync records the date", firstTrial === now.toISOString());
check("later syncs keep the first date", nextTrialUsedAt("active", firstTrial, new Date(now.getTime() + 30 * day)) === firstTrial);
check("canceled trial stays used", nextTrialUsedAt("canceled", firstTrial, now) === firstTrial);
check("active without trial leaves it unset", nextTrialUsedAt("active", null, now) === null);

section("past_due_since");
const since = nextPastDueSince("past_due", null, now);
check("entering past_due starts the clock", since === now.toISOString());
check("staying past_due keeps the start", nextPastDueSince("past_due", since, new Date(now.getTime() + 3 * day)) === since);
check("paid again clears it", nextPastDueSince("active", since, now) === null);
check("canceled clears it", nextPastDueSince("canceled", since, now) === null);

section("grace period");
check("ok when active", paymentState("active", null, now).kind === "ok");
check("ok when trialing", paymentState("trialing", null, now).kind === "ok");
const grace = paymentState("past_due", new Date(now.getTime() - 2 * day).toISOString(), now);
check("2 days past due -> grace", grace.kind === "grace", grace.kind);
check(
  `grace ends ${GRACE_PERIOD_DAYS} days after the failure`,
  grace.kind === "grace" && grace.graceEndsAt.getTime() === now.getTime() - 2 * day + GRACE_PERIOD_DAYS * day
);
const over = paymentState("past_due", new Date(now.getTime() - (GRACE_PERIOD_DAYS + 1) * day).toISOString(), now);
check("past the grace period -> suspended", over.kind === "suspended", over.kind);
const edge = paymentState("past_due", new Date(now.getTime() - GRACE_PERIOD_DAYS * day).toISOString(), now);
check("exactly at the end -> suspended", edge.kind === "suspended", edge.kind);
check("past_due without a date -> grace, not suspended", paymentState("past_due", null, now).kind === "grace");
check("bad date -> no grace end", graceEndsAt("not a date") === null);

section("yearly savings");
check("€39/month vs €390/year -> 17%", yearlySavingsPercent(3900, 39000) === 17, yearlySavingsPercent(3900, 39000));
check("no saving -> 0", yearlySavingsPercent(1000, 12000) === 0);
check("more expensive yearly -> 0", yearlySavingsPercent(1000, 13000) === 0);
check("missing price -> 0", yearlySavingsPercent(0, 1000) === 0);

section("price sync from Stripe (/admin/billing)");
{
  const plans = [{ id: "free", name: "Free" }, { id: "pro", name: "Pro" }, { id: "team", name: "Team" }, { id: "business", name: "Business" }, { id: "enterprise", name: "Enterprise" }];
  const product = (name, metadata = {}, active = true) => ({ id: `prod_${name}`, name, active, metadata });
  const price = (id, prod, interval, amount, extra = {}) => ({ id, currency: "eur", unitAmount: amount, interval, intervalCount: 1, product: prod, ...extra });
  check("product named after a plan", planForProduct(product("Pro"), plans) === "pro");
  check("'Guidon Team' and 'Business plan' match too", planForProduct(product("Guidon Team"), plans) === "team" && planForProduct(product("Business plan"), plans) === "business");
  check("metadata guidon_plan wins over the name", planForProduct(product("Starter", { guidon_plan: "pro" }), plans) === "pro");
  check("unknown metadata plan is no match", planForProduct(product("Pro", { guidon_plan: "gold" }), plans) === null);
  check("a name merely containing a plan is no match", planForProduct(product("Pro Max Bundle"), plans) === null);

  const pro = product("Pro"), team = product("Team");
  const all = buildPriceSync([
    price("price_pw", pro, "week", 249), price("price_pm", pro, "month", 899), price("price_py", pro, "year", 8990),
    price("price_tm", team, "month", 1999),
  ], plans);
  check("weekly, monthly and yearly prices matched", all.matches.length === 4 && all.errors.length === 0 && all.skipped.length === 0, JSON.stringify(all));
  check("amount kept in cents", all.matches.find((m) => m.priceId === "price_py")?.amountCents === 8990);

  const odd = buildPriceSync([
    price("price_q", pro, "month", 2500, { intervalCount: 3 }),
    price("price_usd", pro, "month", 999, { currency: "usd" }),
    price("price_day", pro, "day", 100),
    price("price_free", product("Free"), "month", 100),
    price("price_arch", product("Pro", {}, false), "month", 899),
    price("price_metered", pro, "month", null),
    price("price_other", product("Consulting"), "month", 5000),
  ], plans);
  check("quarterly, USD, daily, Free, archived, metered and unknown products are skipped, not matched", odd.matches.length === 0 && odd.skipped.length === 7 && odd.errors.length === 0, JSON.stringify(odd));

  const dup = buildPriceSync([price("price_a", pro, "month", 899), price("price_b", pro, "month", 999)], plans);
  check("two active prices for one plan and period is an error", dup.errors.length === 1 && dup.matches.length === 1, JSON.stringify(dup));
}

section("price sync writes");
{
  const m = (priceId, planId, interval, amountCents) => ({ priceId, planId, interval, amountCents });
  const row = (stripe_price_id, plan_id, billing_interval, amount_cents, active = true) => ({ stripe_price_id, plan_id, billing_interval, amount_cents, active });
  const first = priceSyncWrites([row("price_old", "pro", "month", 899)], [m("price_pm", "pro", "month", 899), m("price_pw", "pro", "week", 249)]);
  check("a replaced monthly price is switched off, the new ones written", JSON.stringify(first.deactivate) === '["price_old"]' && first.upsert.length === 2, JSON.stringify(first));
  check("monthly fallback follows the new monthly price, not cleared", first.clearMonthly.length === 0 && first.monthly[0]?.priceId === "price_pm");
  const same = priceSyncWrites([row("price_pm", "pro", "month", "899")], [m("price_pm", "pro", "month", 899)]);
  check("nothing to write when already in sync (amount as numeric string too)", same.deactivate.length === 0 && same.upsert.length === 0, JSON.stringify(same));
  const reprice = priceSyncWrites([row("price_pm", "pro", "month", 899)], [m("price_pm", "pro", "month", 999)]);
  check("a changed amount is rewritten", reprice.upsert.length === 1);
  const back = priceSyncWrites([row("price_pm", "pro", "month", 899, false)], [m("price_pm", "pro", "month", 899)]);
  check("an inactive row Stripe sells again is re-activated", back.upsert.length === 1 && back.deactivate.length === 0);
  const gone = priceSyncWrites([row("price_pm", "pro", "month", 899), row("price_old", "team", "week", 499, false)], []);
  check("a monthly price no longer in Stripe is switched off and its fallback cleared; inactive rows untouched",
    JSON.stringify(gone.deactivate) === '["price_pm"]' && gone.clearMonthly[0]?.planId === "pro", JSON.stringify(gone));
}

console.log(`\n  ${pass} pass / ${fail} fail\n`);
process.exit(fail ? 1 : 0);
