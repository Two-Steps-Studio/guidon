import type { BillingInterval } from "./billing-core";

/** Only public price fields; Stripe identifiers never cross the client boundary. */
export interface PublicPlanPrice {
  plan_id: string;
  billing_interval: BillingInterval;
  amount_cents: number;
}

export function publicPlanPrice(
  plan: { id: string; price_cents: number | null; price_pln_cents: number | null },
  prices: PublicPlanPrice[],
  interval: BillingInterval,
  currency: "EUR" | "PLN",
): { cents: number | null | undefined; currency: "EUR" | "PLN" } {
  if (plan.price_cents === null || plan.price_cents === 0) return { cents: plan.price_cents, currency };
  // plan_prices is the EUR catalogue used by Checkout, not an exchange-rate table.
  const configured = prices.find(price => price.plan_id === plan.id && price.billing_interval === interval);
  if (configured) return { cents: configured.amount_cents, currency: "EUR" };
  if (interval !== "month") return { cents: undefined, currency };
  return currency === "PLN" && plan.price_pln_cents !== null
    ? { cents: plan.price_pln_cents, currency: "PLN" }
    : { cents: plan.price_cents, currency: "EUR" };
}
