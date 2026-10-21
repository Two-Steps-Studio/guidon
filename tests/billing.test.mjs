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

console.log(`\n  ${pass} pass / ${fail} fail\n`);
process.exit(fail ? 1 : 0);
