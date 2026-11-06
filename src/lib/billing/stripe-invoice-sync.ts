import "server-only";
import type Stripe from "stripe";
import { serviceDataClient } from "@/lib/data-client";
import { stripeInvoicePdf, summarizeInvoicePayment, type InvoicePaymentSummary } from "./stripe-invoice-core";

export async function syncStripeInvoice(stripe: Stripe, event: Stripe.Event) {
  const payload = event.data.object;
  const invoiceId = payload.object === "invoice" ? payload.id
    : payload.object === "invoice_payment" ? (typeof payload.invoice === "string" ? payload.invoice : payload.invoice.id)
    : null;
  if (!invoiceId?.startsWith("in_")) return;
  const observedAt = new Date().toISOString();
  const invoice = await stripe.invoices.retrieve(invoiceId);
  if (invoice.livemode !== event.livemode || invoice.status === "draft" || !invoice.status || !invoice.customer) return;

  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer.id;
  const db = serviceDataClient();
  const { data, error } = await db.from<{ organization_id: string }>("subscriptions")
    .select("organization_id").eq("stripe_customer_id", customerId).limit(2);
  if (error || data.length > 1) throw new Error("Ambiguous Stripe invoice organization");
  if (!data[0]) {
    if (invoice.parent?.subscription_details?.metadata?.organization_id) {
      throw new Error("Guidon subscription is not synced yet");
    }
    return;
  }

  await saveInvoice(stripe, invoice, data[0].organization_id, observedAt,
    event.type === "invoice.payment_failed" ? new Date(event.created * 1000).toISOString() : null);
}

async function saveInvoice(stripe: Stripe, invoice: Stripe.Invoice, organizationId: string, observedAt: string, failedAt: string | null) {
  const payments: InvoicePaymentSummary[] = [];
  for await (const payment of stripe.invoicePayments.list({
    invoice: invoice.id, limit: 100,
    expand: ["data.payment.charge", "data.payment.payment_intent.latest_charge"],
  })) payments.push(summarizeInvoicePayment(payment));
  const saved = await serviceDataClient().rpc("platform_stripe_save_invoice_history", { p_invoice: {
    invoice_id: invoice.id, organization_id: organizationId, invoice_number: invoice.number,
    status: invoice.status, currency: invoice.currency, amount_due: invoice.amount_due,
    amount_paid: invoice.amount_paid, amount_remaining: invoice.amount_remaining, attempt_count: invoice.attempt_count,
    invoice_pdf: stripeInvoicePdf(invoice.invoice_pdf), card_last4: payments.find(payment => payment.last4)?.last4 ?? null, observed_at: observedAt,
    issued_at: new Date(invoice.created * 1000).toISOString(),
    failed_at: failedAt,
  }, p_payments: payments });
  if (saved.error) throw new Error("Could not persist Stripe invoice");
}

export async function importStripeInvoiceBatch(stripe: Stripe, organizationId: string, after: string | null) {
  const db = serviceDataClient();
  const { data, error } = await db.from<{ stripe_customer_id: string | null }>("subscriptions")
    .select("stripe_customer_id").eq("organization_id", organizationId).maybeSingle();
  if (error || !data?.stripe_customer_id) return null;
  const customer = data.stripe_customer_id;
  const owners = await db.from("subscriptions").eq("stripe_customer_id", customer).count();
  if (owners.error || owners.data !== 1) return null;
  const observedAt = new Date().toISOString();
  const page = await stripe.invoices.list({ customer, limit: 5, ...(after ? { starting_after: after } : {}) });
  let imported = 0;
  for (const invoice of page.data) {
    if (!invoice.status || invoice.status === "draft") continue;
    if ((typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id) !== customer) {
      throw new Error("Unexpected Stripe invoice customer");
    }
    await saveInvoice(stripe, invoice, organizationId, observedAt, null);
    imported++;
  }
  return { imported, next: page.has_more ? page.data.at(-1)?.id ?? null : null };
}
