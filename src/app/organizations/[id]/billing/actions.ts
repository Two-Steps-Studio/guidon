"use server";

import { redirect } from "next/navigation";
import { getOrgAccess, canManageOrg } from "@/lib/data/org-access";
import { getCurrentUser } from "@/lib/data/current-user";
import { hasDirectDatabase } from "@/lib/db/pool";
import { createServiceClient } from "@/lib/supabase-server";
import { getStripe, isBillingConfigured } from "@/lib/billing/stripe";
import { SITE_URL } from "@/lib/site-url";
import { tr } from "@/lib/i18n/server-errors";
import { TRIAL_PERIOD_DAYS, canStartTrial, isBillingInterval, type BillingInterval } from "@/lib/billing/billing-core";

type BillingGuard = { organizationId: string; userEmail: string | undefined } | { error: string };

async function requireBillingManager(organizationId: string): Promise<BillingGuard> {
  if (hasDirectDatabase()) {
    return { error: await tr("Billing is not available for self-hosted installations.") };
  }
  if (!isBillingConfigured()) {
    return { error: await tr("Billing is not configured on this server yet.") };
  }
  const access = await getOrgAccess(organizationId);
  if (!access || !canManageOrg(access.role)) {
    return { error: await tr("You do not have permission to manage billing for this organization.") };
  }
  const user = await getCurrentUser();
  return { organizationId, userEmail: user.email };
}

/** Redirects to Stripe Checkout on success - only ever returns on failure. */
export async function createCheckoutSession(
  organizationId: string,
  planId: string,
  interval: BillingInterval = "month"
): Promise<{ error: string | null }> {
  const guard = await requireBillingManager(organizationId);
  if ("error" in guard) return { error: guard.error };
  if (!isBillingInterval(interval)) return { error: await tr("Unknown billing period.") };

  const supabase = createServiceClient();
  const [{ data: plan }, { data: price }, { data: subscription }] = await Promise.all([
    supabase.from("plans").select("id, stripe_price_id").eq("id", planId).maybeSingle(),
    supabase
      .from("plan_prices")
      .select("stripe_price_id")
      .eq("plan_id", planId)
      .eq("billing_interval", interval)
      .eq("active", true)
      .maybeSingle(),
    // "*": trial_used_at (071) is absent before that migration.
    supabase.from("subscriptions").select("*").eq("organization_id", organizationId).maybeSingle(),
  ]);

  if (!plan) return { error: await tr("Unknown plan.") };
  // plans.stripe_price_id is the monthly price from before plan_prices (071).
  const priceId = price?.stripe_price_id ?? (interval === "month" ? plan.stripe_price_id : null);
  if (!priceId) {
    return { error: await tr("This plan isn't available for self-serve checkout yet - contact us instead.") };
  }

  const stripe = getStripe();
  const existing = (subscription ?? {}) as { stripe_customer_id?: string | null; trial_used_at?: string | null };
  const existingCustomerId = existing.stripe_customer_id ?? undefined;
  // One free trial per organization, without a card: Checkout only asks for
  // one if the price needs paying today, and a trial that ends with no card
  // on file is cancelled - the webhook then puts the organization back on
  // Free. A second subscription (after cancelling) pays from day one.
  const offerTrial = canStartTrial(existing.trial_used_at);

  let checkoutUrl: string | null;
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: existingCustomerId,
      customer_email: existingCustomerId ? undefined : guard.userEmail,
      line_items: [{ price: priceId, quantity: 1 }],
      // Discounts are Stripe's own promotion codes (Dashboard -> Products ->
      // Coupons), typed on the checkout page - Stripe then handles the
      // discount, taxes and renewals. Guidon's own codes (migration 062)
      // grant a plan for free instead, see promo-actions.ts.
      allow_promotion_codes: true,
      ...(offerTrial ? { payment_method_collection: "if_required" as const } : {}),
      subscription_data: {
        ...(offerTrial
          ? {
              trial_period_days: TRIAL_PERIOD_DAYS,
              trial_settings: { end_behavior: { missing_payment_method: "cancel" as const } },
            }
          : {}),
        // The webhook (src/app/api/stripe/webhook/route.ts) has no other way
        // to know which Guidon organization a Stripe subscription belongs
        // to - this metadata travels on the subscription object itself, not
        // just this Checkout Session, so every later
        // customer.subscription.updated/deleted event carries it too.
        metadata: { organization_id: organizationId },
      },
      success_url: `${SITE_URL}/organizations/${organizationId}/billing?checkout=success`,
      cancel_url: `${SITE_URL}/organizations/${organizationId}/billing?checkout=cancelled`,
    });
    checkoutUrl = session.url;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not start checkout." };
  }

  if (!checkoutUrl) return { error: await tr("Stripe did not return a checkout URL.") };
  // First checkout of the organization, for the funnel (migration 096). Best effort:
  // the column is absent before 096 and counting never blocks paying.
  const { error: funnelError } = await supabase.from("subscriptions").update({ checkout_started_at: new Date().toISOString() })
    .eq("organization_id", organizationId).is("checkout_started_at", null);
  if (funnelError && !/checkout_started_at/.test(funnelError.message)) console.error("[funnel] checkout_started_at", funnelError.message);
  redirect(checkoutUrl);
}

/** Redirects to the Stripe Customer Portal on success - only ever returns on failure. */
export async function createPortalSession(organizationId: string): Promise<{ error: string | null }> {
  const guard = await requireBillingManager(organizationId);
  if ("error" in guard) return { error: guard.error };

  const supabase = createServiceClient();
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!subscription?.stripe_customer_id) {
    return { error: await tr("This organization has no billing account yet - upgrade a plan first.") };
  }

  const stripe = getStripe();
  let portalUrl: string;
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${SITE_URL}/organizations/${organizationId}/billing`,
    });
    portalUrl = session.url;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not open the billing portal." };
  }

  redirect(portalUrl);
}
