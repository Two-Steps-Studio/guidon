"use server";

import { revalidatePath } from "next/cache";
import { auditAdminMutation, AUDIT_UUID } from "@/lib/admin/audit";
import { getStripe, isBillingConfigured } from "@/lib/billing/stripe";
import { importStripeInvoiceBatch } from "@/lib/billing/stripe-invoice-sync";
import { hasDirectDatabase } from "@/lib/db/pool";
import { serviceDataClient } from "@/lib/data-client";
import { canRetryStripeInvoice } from "@/lib/billing/stripe-invoice-core";
import { evaluateFlag, FLAG_KEY } from "@/lib/admin/flag-policy";
import { readFeatureFlag } from "@/lib/admin/feature-flags";

export async function importOrganizationInvoices(organizationId: string, after: string | null) {
  return auditAdminMutation<{ error: string | null; next?: string | null; imported?: number }>(
    "billing.invoices.import", organizationId, async (admin, changes) => {
      if (typeof organizationId !== "string" || !AUDIT_UUID.test(organizationId) ||
          (after !== null && (typeof after !== "string" || !/^in_[a-z\d]{1,100}$/i.test(after)))) return { error: "invalid" };
      if (hasDirectDatabase() || !isBillingConfigured()) return { error: "unavailable" };
      const [flag, subscription] = await Promise.all([
        readFeatureFlag(FLAG_KEY),
        serviceDataClient().from<{ plan_id: string }>("subscriptions").select("plan_id").eq("organization_id", organizationId).maybeSingle(),
      ]);
      if (!flag || subscription.error || !evaluateFlag(FLAG_KEY, flag, {
        user: admin.id, organization: organizationId, plan: subscription.data?.plan_id,
      })) return { error: "unavailable" };
      try {
        const batch = await importStripeInvoiceBatch(getStripe(), organizationId, after);
        if (!batch) return { error: "unavailable" };
        changes.after = { imported_invoices: batch.imported };
        revalidatePath("/admin/billing/invoices");
        return { error: null, ...batch };
      } catch {
        return { error: "unavailable" };
      }
    },
  );
}

export async function retryInvoicePayment(invoiceId: string, confirmation: string, requestId: string, amount: number, currency: string) {
  return auditAdminMutation("billing.invoices.retry", invoiceId, async (_admin, changes) => {
    if (typeof invoiceId !== "string" || !/^in_[a-z\d]{1,100}$/i.test(invoiceId) || confirmation !== invoiceId ||
        typeof requestId !== "string" || !AUDIT_UUID.test(requestId) || !Number.isSafeInteger(amount) || amount < 1 ||
        typeof currency !== "string" || !/^[a-z]{3}$/.test(currency)) return { error: "invalid" };
    if (hasDirectDatabase() || !isBillingConfigured()) return { error: "unavailable" };

    const db = serviceDataClient();
    const { data: row, error } = await db.from<{ organization_id: string }>("platform_stripe_invoices")
      .select("organization_id").eq("invoice_id", invoiceId).eq("status", "open").gt("attempt_count", 0)
      .eq("amount_remaining", amount).eq("currency", currency).maybeSingle();
    if (error || !row) return { error: "stale" };
    const { data: subscription, error: subscriptionError } = await db.from<{ stripe_customer_id: string | null }>("subscriptions")
      .select("stripe_customer_id").eq("organization_id", row.organization_id).maybeSingle();
    if (subscriptionError || !subscription?.stripe_customer_id) return { error: "unavailable" };
    const owners = await db.from("subscriptions").eq("stripe_customer_id", subscription.stripe_customer_id).count();
    if (owners.error || owners.data !== 1) return { error: "unavailable" };

    try {
      const stripe = getStripe();
      const invoice = await stripe.invoices.retrieve(invoiceId);
      if (!canRetryStripeInvoice(invoice, { customer: subscription.stripe_customer_id, amount, currency })) return { error: "stale" };
      changes.before = { invoice_payment_status: "open" };
      const updated = await stripe.invoices.pay(invoiceId, {}, { idempotencyKey: `guidon-admin-retry-${invoiceId}-${requestId}` });
      if (updated.status !== "paid") {
        changes.after = { invoice_payment_status: "unconfirmed" };
        return { error: "unavailable" };
      }
      changes.after = { invoice_payment_status: "paid" };
      return { error: null };
    } catch {
      return { error: "unavailable" };
    }
  });
}
