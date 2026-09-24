import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, isBillingConfigured } from "@/lib/billing/stripe";
import { createServiceClient } from "@/lib/supabase-server";
import { hasDirectDatabase } from "@/lib/db/pool";
import { ORG_PROJECT_LIMIT_UNLIMITED_SENTINEL } from "@/app/admin/organizations/constants";

/** Stripe's own events are small JSON - generous cap against an unsigned, unbounded body. */
const MAX_BODY_BYTES = 1024 * 1024;

/**
 * Stripe webhook: keeps `subscriptions` (015) in sync with what a customer
 * actually pays for through Checkout/the Customer Portal
 * (src/app/organizations/[id]/billing/actions.ts). Subscribe this endpoint
 * in the Stripe Dashboard to customer.subscription.created/updated/deleted -
 * every field this handler needs (status, price, period dates,
 * cancel_at_period_end, and this app's own organization_id via the
 * subscription's metadata, set at checkout time) travels on the
 * subscription object itself, so checkout.session.completed isn't needed.
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid signature." },
      { status: 401 }
    );
  }

  const firstDelivery = await recordEventOnce(event.id, event.type);
  if (!firstDelivery) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  try {
    await handleEvent(event);
  } catch (error) {
    console.error("[Stripe webhook]", event.type, error);
    return NextResponse.json({ error: "Failed to process event." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/** True the first time this Stripe event id is seen - false on a redelivery. */
async function recordEventOnce(eventId: string, eventType: string): Promise<boolean> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("stripe_webhook_events")
    .upsert({ event_id: eventId, event_type: eventType }, { onConflict: "event_id", ignoreDuplicates: true })
    .select("event_id");
  if (error) throw new Error(error.message);
  return (data ?? []).length === 1;
}

async function handleEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await syncSubscription(event.data.object as Stripe.Subscription);
      return;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
      return;
    default:
      // The Dashboard only sends what this endpoint is subscribed to -
      // anything else reaching here is a configuration mismatch, not an
      // error to surface as a failed delivery.
      return;
  }
}

/** Guidon's own vocabulary (015's CHECK constraint) is narrower than Stripe's. */
function mapStripeStatus(status: Stripe.Subscription.Status): "active" | "trialing" | "past_due" | "canceled" {
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    default:
      // incomplete/paused/anything future Stripe adds: no confirmed payment
      // yet, or access explicitly suspended - never silently grant active
      // access for a status this app doesn't recognize.
      return "past_due";
  }
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
  await supabase
    .from("organizations")
    .update({ project_limit: plan?.project_limit ?? ORG_PROJECT_LIMIT_UNLIMITED_SENTINEL })
    .eq("id", organizationId);
}

async function syncSubscription(subscription: Stripe.Subscription): Promise<void> {
  const organizationId = subscription.metadata?.organization_id;
  if (!organizationId) {
    console.error("[Stripe webhook] subscription", subscription.id, "has no organization_id metadata - ignoring");
    return;
  }

  const supabase = createServiceClient();
  const item = subscription.items.data[0];
  const priceId = item?.price?.id;

  let planId = "free";
  if (priceId) {
    const { data: plan } = await supabase.from("plans").select("id").eq("stripe_price_id", priceId).maybeSingle();
    if (plan) planId = plan.id;
  }

  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

  const { error } = await supabase
    .from("subscriptions")
    .update({
      plan_id: planId,
      status: mapStripeStatus(subscription.status),
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      current_period_start: item ? new Date(item.current_period_start * 1000).toISOString() : undefined,
      current_period_end: item ? new Date(item.current_period_end * 1000).toISOString() : undefined,
      cancel_at_period_end: subscription.cancel_at_period_end,
    })
    .eq("organization_id", organizationId);

  if (error) throw new Error(error.message);

  await syncOrgProjectLimit(supabase, organizationId, planId);
}

/** Canceled (not just cancel_at_period_end, the subscription is actually gone): fall back to Free. */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  const organizationId = subscription.metadata?.organization_id;
  if (!organizationId) {
    console.error("[Stripe webhook] subscription", subscription.id, "has no organization_id metadata - ignoring");
    return;
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("subscriptions")
    .update({
      plan_id: "free",
      status: "canceled",
      cancel_at_period_end: false,
    })
    .eq("organization_id", organizationId);
  if (error) throw new Error(error.message);

  await syncOrgProjectLimit(supabase, organizationId, "free");
}
