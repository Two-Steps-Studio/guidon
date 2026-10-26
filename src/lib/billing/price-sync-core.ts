/**
 * Which Stripe prices sell which Guidon plan for which period - the rules
 * behind /admin/billing's "Sync prices from Stripe". No imports, so
 * tests/billing.test.mjs runs it with Node's type stripping.
 *
 * A product belongs to a plan by its `guidon_plan` metadata (Stripe
 * Dashboard -> product -> Metadata), or else by its name: "Pro", "Team",
 * "Guidon Business"... Only recurring prices billed every 1 week, 1 month
 * or 1 year, in EUR (the billing page shows euros), are used. Two active
 * prices for the same plan and period is an error to fix in Stripe
 * (archive one), never a guess.
 */

export type SyncInterval = "week" | "month" | "year";

export interface StripePriceInput {
  id: string;
  currency: string;
  unitAmount: number | null;
  interval: string | null;
  intervalCount: number | null;
  product: { id: string; name: string; active: boolean; metadata: Record<string, string> } | null;
}

export interface PlanInput {
  id: string;
  name: string;
}

export interface PriceMatch {
  planId: string;
  interval: SyncInterval;
  priceId: string;
  amountCents: number;
}

export interface PriceSyncPlan {
  matches: PriceMatch[];
  /** Readable reasons a price was left out (shown to the admin). */
  skipped: string[];
  /** Blocking problems: nothing is applied while any exist. */
  errors: string[];
}

const SYNC_INTERVALS: readonly SyncInterval[] = ["week", "month", "year"];
/** Plans never sold through Checkout. */
const NOT_SOLD = new Set(["free", "enterprise"]);

const normalize = (value: string) => value.trim().toLowerCase().replace(/^guidon\s+/, "").replace(/\s+plan$/, "");

/** The plan id a Stripe product sells, or null. */
export function planForProduct(
  product: { name: string; metadata: Record<string, string> },
  plans: readonly PlanInput[]
): string | null {
  const tagged = product.metadata?.guidon_plan?.trim().toLowerCase();
  if (tagged) return plans.some((plan) => plan.id === tagged) ? tagged : null;
  const name = normalize(product.name);
  const plan = plans.find((candidate) => candidate.id === name || normalize(candidate.name) === name);
  return plan?.id ?? null;
}

export function buildPriceSync(prices: readonly StripePriceInput[], plans: readonly PlanInput[]): PriceSyncPlan {
  const matches: PriceMatch[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  for (const price of prices) {
    const label = `${price.product?.name ?? "?"} (${price.id})`;
    if (!price.product || !price.product.active) {
      skipped.push(`${label}: product is archived`);
      continue;
    }
    const planId = planForProduct(price.product, plans);
    if (!planId) {
      skipped.push(`${label}: no Guidon plan with this name - name the product after a plan or set metadata guidon_plan`);
      continue;
    }
    if (NOT_SOLD.has(planId)) {
      skipped.push(`${label}: the ${planId} plan is not sold through checkout`);
      continue;
    }
    const interval = SYNC_INTERVALS.find((value) => value === price.interval);
    if (!interval || price.intervalCount !== 1) {
      skipped.push(`${label}: billed every ${price.intervalCount ?? "?"} ${price.interval ?? "?"} - only 1 week, 1 month or 1 year`);
      continue;
    }
    if (price.currency.toLowerCase() !== "eur") {
      skipped.push(`${label}: ${price.currency.toUpperCase()} - prices are shown in EUR`);
      continue;
    }
    if (price.unitAmount === null || !Number.isInteger(price.unitAmount) || price.unitAmount <= 0) {
      skipped.push(`${label}: no fixed amount`);
      continue;
    }
    const duplicate = matches.find((match) => match.planId === planId && match.interval === interval);
    if (duplicate) {
      errors.push(`Two active ${interval}ly prices for ${planId}: ${duplicate.priceId} and ${price.id} - archive one in Stripe`);
      continue;
    }
    matches.push({ planId, interval, priceId: price.id, amountCents: price.unitAmount });
  }

  return { matches, skipped, errors };
}

export interface StoredPriceInput {
  stripe_price_id: string;
  plan_id: string;
  billing_interval: string;
  amount_cents: number;
  active: boolean;
}

export interface PriceSyncWrites {
  /** Active rows Stripe no longer sells - switched off, kept for the webhook. */
  deactivate: string[];
  /** Prices to insert, re-activate or correct. */
  upsert: PriceMatch[];
  /** plans whose monthly fallback (plans.stripe_price_id) points at a price being switched off without a replacement. */
  clearMonthly: { planId: string; priceId: string }[];
  /** plans.stripe_price_id/price_cents to set from the monthly price. */
  monthly: PriceMatch[];
}

/**
 * What to write so plan_prices matches Stripe. Deactivations come first when
 * applied: at most one active price per plan and period (071).
 */
export function priceSyncWrites(stored: readonly StoredPriceInput[], matches: readonly PriceMatch[]): PriceSyncWrites {
  const wanted = new Set(matches.map((match) => match.priceId));
  const deactivate: string[] = [];
  const clearMonthly: { planId: string; priceId: string }[] = [];
  for (const row of stored) {
    if (!row.active || wanted.has(row.stripe_price_id)) continue;
    deactivate.push(row.stripe_price_id);
    if (row.billing_interval === "month" && !matches.some((match) => match.planId === row.plan_id && match.interval === "month")) {
      clearMonthly.push({ planId: row.plan_id, priceId: row.stripe_price_id });
    }
  }
  const upsert = matches.filter((match) => {
    const current = stored.find((row) => row.stripe_price_id === match.priceId);
    return !(
      current?.active &&
      current.plan_id === match.planId &&
      current.billing_interval === match.interval &&
      Number(current.amount_cents) === match.amountCents
    );
  });
  return { deactivate, upsert, clearMonthly, monthly: matches.filter((match) => match.interval === "month") };
}
