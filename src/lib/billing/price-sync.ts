import "server-only";

import { getStripe } from "@/lib/billing/stripe";
import { serviceDataClient } from "@/lib/data-client";
import {
  buildPriceSync,
  priceSyncWrites,
  type PlanInput,
  type PriceMatch,
  type PriceSyncPlan,
  type StripePriceInput,
} from "@/lib/billing/price-sync-core";

/**
 * /admin/billing's "Sync prices from Stripe": reads the account's active
 * recurring prices and writes them to plan_prices (migration 071), which
 * the billing page's week/month/year tabs and Checkout read. Service role -
 * plan_prices is written by nobody else.
 */

export interface StoredPrice {
  stripe_price_id: string;
  plan_id: string;
  billing_interval: string;
  amount_cents: number;
  active: boolean;
}

export async function loadPlans(): Promise<PlanInput[]> {
  const { data } = await serviceDataClient()
    .from<{ id: string; name: string }>("plans")
    .select("id, name")
    .order("sort_order", { ascending: true });
  return data ?? [];
}

export async function loadStoredPrices(): Promise<StoredPrice[]> {
  const { data } = await serviceDataClient().from<StoredPrice>("plan_prices").select("*");
  return (data ?? []).map((row) => ({ ...row, amount_cents: Number(row.amount_cents) }));
}

/** Every active recurring price in the Stripe account, with its product. */
async function fetchStripePrices(): Promise<StripePriceInput[]> {
  const out: StripePriceInput[] = [];
  for await (const price of getStripe().prices.list({ active: true, type: "recurring", expand: ["data.product"], limit: 100 })) {
    const product = typeof price.product === "object" && price.product && !("deleted" in price.product && price.product.deleted)
      ? (price.product as { id: string; name: string; active: boolean; metadata: Record<string, string> })
      : null;
    out.push({
      id: price.id,
      currency: price.currency,
      unitAmount: price.unit_amount,
      interval: price.recurring?.interval ?? null,
      intervalCount: price.recurring?.interval_count ?? null,
      product: product ? { id: product.id, name: product.name, active: product.active, metadata: product.metadata ?? {} } : null,
    });
  }
  return out;
}

export async function previewPriceSync(): Promise<PriceSyncPlan> {
  const [prices, plans] = await Promise.all([fetchStripePrices(), loadPlans()]);
  return buildPriceSync(prices, plans);
}

/**
 * Makes plan_prices match Stripe: each matched price becomes the one active
 * price for its plan and period; an active row Stripe no longer sells is
 * deactivated (kept, so the webhook still maps existing subscriptions on
 * it). plans.stripe_price_id/price_cents follow the monthly price - the
 * pre-071 fallback in checkout. Not one transaction (data client): every
 * step is idempotent, so running the sync again finishes a partial run.
 */
export async function applyPriceSync(matches: readonly PriceMatch[]): Promise<{ error: string | null; changed: number }> {
  const db = serviceDataClient();
  const writes = priceSyncWrites(await loadStoredPrices(), matches);
  let changed = 0;

  for (const priceId of writes.deactivate) {
    const { error } = await db.from("plan_prices").update({ active: false }).eq("stripe_price_id", priceId);
    if (error) return { error: error.message, changed };
    changed++;
  }
  for (const { planId, priceId } of writes.clearMonthly) {
    const { error } = await db.from("plans").update({ stripe_price_id: null }).eq("id", planId).eq("stripe_price_id", priceId);
    if (error) return { error: error.message, changed };
  }
  for (const match of writes.upsert) {
    const { error } = await db.upsertRow("plan_prices", {
      key: { stripe_price_id: match.priceId },
      set: { plan_id: match.planId, billing_interval: match.interval, amount_cents: match.amountCents, active: true },
    });
    if (error) return { error: error.message, changed };
    changed++;
  }
  for (const match of writes.monthly) {
    const { error } = await db
      .from("plans")
      .update({ stripe_price_id: match.priceId, price_cents: match.amountCents })
      .eq("id", match.planId);
    if (error) return { error: error.message, changed };
  }
  return { error: null, changed };
}
