import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, isBillingConfigured } from "@/lib/billing/stripe";
import { createServiceClient } from "@/lib/supabase-server";
import { hasDirectDatabase } from "@/lib/db/pool";
import { ORG_PROJECT_LIMIT_UNLIMITED_SENTINEL } from "@/app/admin/organizations/constants";
import { processStripeEvent, snapshotFromStripe, type WebhookDeps } from "@/lib/billing/stripe-webhook-core";

/** Stripe's own events are small JSON - generous cap against an unsigned, unbounded body. */
const MAX_BODY_BYTES = 1024 * 1024;

/**
 * Stripe webhook: keeps `subscriptions` (015) in sync with what a customer
 * actually pays for through Checkout/the Customer Portal
 * (src/app/organizations/[id]/billing/actions.ts). Subscribe this endpoint
 * in the Stripe Dashboard to customer.subscription.created/updated/deleted -
 * the handler re-reads the subscription from Stripe for each event (its
 * current status, price, period dates, cancel_at_period_end and this app's
 * organization_id metadata, set at checkout time), so delivery order doesn't
 * matter and checkout.session.completed isn't needed. The rules live in
 * src/lib/billing/stripe-webhook-core.ts (tests/billing-webhook.test.mjs).
 *
 * Authenticated by the endpoint's signing secret (STRIPE_WEBHOOK_SECRET,
 * Stripe-Signature header), not a session or API key - hence listed in
 * src/proxy.ts's public routes, same as the GitHub App webhook.
 *
 * Billing is a hosted-only concept (self-hosted installs have no plan
 * enforcement at all - src/lib/limits.ts exempts them everywhere), so this
 * always reads/writes through the service-role Supabase client, same
 * simplification src/lib/limits.ts's getOrgPlanLimits() already makes.
 */
export async function POST(request: NextRequest) {
  if (hasDirectDatabase() || !isBillingConfigured()) {
    return NextResponse.json({ error: "Billing is not configured on this server." }, { status: 503 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET is not set." }, { status: 503 });
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (!request.headers.get("content-length") || !Number.isFinite(declaredLength)) {
    return NextResponse.json({ error: "Content-Length is required." }, { status: 411 });
  }
  if (declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe-Signature." }, { status: 401 });
  }

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid signature." }, { status: 401 });
  }

  const outcome = await processStripeEvent(event, webhookDeps(stripe));
  return NextResponse.json(outcome.body, { status: outcome.status });
}

/**
 * Supabase (service role) and the Stripe API for src/lib/billing/stripe-webhook-core.ts,
 * which holds the rules: claim/release, current state from Stripe, no plan without payment.
 */
function webhookDeps(stripe: Stripe): WebhookDeps {
  const supabase = createServiceClient();
  return {
    async claimEvent(eventId, eventType) {
      const { data, error } = await supabase
        .from("stripe_webhook_events")
        .upsert({ event_id: eventId, event_type: eventType }, { onConflict: "event_id", ignoreDuplicates: true })
        .select("event_id");
      if (error) throw new Error(error.message);
      return (data ?? []).length === 1;
    },
    async releaseEvent(eventId) {
      const { error } = await supabase.from("stripe_webhook_events").delete().eq("event_id", eventId);
      if (error) throw new Error(error.message);
    },
    async retrieveSubscription(subscriptionId) {
      return snapshotFromStripe(await stripe.subscriptions.retrieve(subscriptionId));
    },
    async loadStored(organizationId) {
      // "*": the 071 columns are simply absent on a database that hasn't run it yet.
      const { data } = await supabase.from("subscriptions").select("*").eq("organization_id", organizationId).maybeSingle();
      if (!data) return null;
      const row = data as { stripe_subscription_id?: string | null; status?: string | null; trial_used_at?: string | null; past_due_since?: string | null };
      return {
        stripeSubscriptionId: row.stripe_subscription_id ?? null,
        status: row.status ?? null,
        trialUsedAt: row.trial_used_at ?? null,
        pastDueSince: row.past_due_since ?? null,
        hasBillingColumns: "trial_used_at" in data,
      };
    },
    planIdForPrice: (priceId) => planIdForPrice(supabase, priceId),
    async saveSubscription(organizationId, patch) {
      const { data, error } = await supabase.from("subscriptions").update(patch).eq("organization_id", organizationId).select("organization_id");
      if (error) throw new Error(error.message);
      return (data ?? []).length;
    },
    syncProjectLimit: (organizationId, planId) => syncOrgProjectLimit(supabase, organizationId, planId),
    log: (message, ...details) => console.error(message, ...details),
    now: () => new Date(),
  };
}

/**
 * organizations.project_limit (014) is a separate, independently-editable
 * column that admin/organizations/actions.ts's updateOrganizationPlan also
 * keeps in sync on a manual plan change - mirrored here so a real Stripe
 * plan change (either direction) has the same effect as an admin doing it
 * by hand. NULL on plans.project_limit means unlimited, but the
 * organizations column has a `CHECK (project_limit >= 1)` and no NULL/
 * unlimited concept, hence the same sentinel updateOrganizationPlan uses.
 */
async function syncOrgProjectLimit(
  supabase: ReturnType<typeof createServiceClient>,
  organizationId: string,
  planId: string
): Promise<void> {
  const { data: plan } = await supabase.from("plans").select("project_limit").eq("id", planId).maybeSingle();
  const { data: updatedRows, error } = await supabase
    .from("organizations")
    .update({ project_limit: plan?.project_limit ?? ORG_PROJECT_LIMIT_UNLIMITED_SENTINEL })
    .eq("id", organizationId)
    .select("id");
  if (error) throw new Error(error.message);
  // This runs through the service-role client, so unlike a Server Action
  // there's no RLS backstop - a zero-rows update here means organizationId
  // doesn't exist (deleted org, stale/corrupted Stripe metadata) and would
  // otherwise fail completely silently.
  if (!updatedRows || updatedRows.length === 0) {
    console.error(
      "[Stripe webhook] organizations.project_limit update matched no row for organization_id",
      organizationId
    );
  }
}

/**
 * The plan a Stripe Price belongs to: plan_prices (071 - weekly/monthly/
 * yearly, inactive prices included, since existing subscriptions stay on a
 * price after it's replaced), then plans.stripe_price_id (the original
 * monthly price), else Free.
 */
async function planIdForPrice(supabase: ReturnType<typeof createServiceClient>, priceId: string): Promise<string> {
  const { data: price } = await supabase.from("plan_prices").select("plan_id").eq("stripe_price_id", priceId).maybeSingle();
  if (price?.plan_id) return price.plan_id;
  const { data: plan } = await supabase.from("plans").select("id").eq("stripe_price_id", priceId).maybeSingle();
  return plan?.id ?? "free";
}
