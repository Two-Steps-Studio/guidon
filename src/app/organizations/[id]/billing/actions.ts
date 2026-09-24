"use server";

import { redirect } from "next/navigation";
import { getOrgAccess, canManageOrg } from "@/lib/data/org-access";
import { getCurrentUser } from "@/lib/data/current-user";
import { hasDirectDatabase } from "@/lib/db/pool";
import { createServiceClient } from "@/lib/supabase-server";
import { getStripe, isBillingConfigured } from "@/lib/billing/stripe";
import { SITE_URL } from "@/lib/site-url";

/** Applied to every new paid subscription - see the brainstorm for why unconditional is fine here (self-serve upgrades never reuse an existing Checkout Session, and an org that already has one is routed to the Customer Portal instead, not back through Checkout). */
const TRIAL_PERIOD_DAYS = 14;

type BillingGuard = { organizationId: string; userEmail: string | undefined } | { error: string };

async function requireBillingManager(organizationId: string): Promise<BillingGuard> {
  if (hasDirectDatabase()) {
    return { error: "Billing is not available for self-hosted installations." };
  }
  if (!isBillingConfigured()) {
    return { error: "Billing is not configured on this server yet." };
  }
  const access = await getOrgAccess(organizationId);
  if (!access || !canManageOrg(access.role)) {
    return { error: "You do not have permission to manage billing for this organization." };
  }
  const user = await getCurrentUser();
  return { organizationId, userEmail: user.email };
}

/** Redirects to Stripe Checkout on success - only ever returns on failure. */
export async function createCheckoutSession(organizationId: string, planId: string): Promise<{ error: string | null }> {
  const guard = await requireBillingManager(organizationId);
  if ("error" in guard) return { error: guard.error };

  const supabase = createServiceClient();
  const [{ data: plan }, { data: subscription }] = await Promise.all([
    supabase.from("plans").select("id, stripe_price_id").eq("id", planId).maybeSingle(),
    supabase.from("subscriptions").select("stripe_customer_id").eq("organization_id", organizationId).maybeSingle(),
  ]);

  if (!plan) return { error: "Unknown plan." };
  if (!plan.stripe_price_id) {
    return { error: "This plan isn't available for self-serve checkout yet - contact us instead." };
  }

  const stripe = getStripe();
  const existingCustomerId = subscription?.stripe_customer_id ?? undefined;

  let checkoutUrl: string | null;
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: existingCustomerId,
      customer_email: existingCustomerId ? undefined : guard.userEmail,
      line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
      subscription_data: {
        trial_period_days: TRIAL_PERIOD_DAYS,
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

  if (!checkoutUrl) return { error: "Stripe did not return a checkout URL." };
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
    return { error: "This organization has no billing account yet - upgrade a plan first." };
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
