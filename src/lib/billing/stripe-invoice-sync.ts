import "server-only";
import type Stripe from "stripe";
import { serviceDataClient } from "@/lib/data-client";
import { invoiceCardLastFour, stripeInvoicePdf } from "./stripe-invoice-core";

export async function syncStripeInvoice(stripe: Stripe, event: Stripe.Event) {
  const payload = event.data.object as Stripe.Invoice;
  if (payload.object !== "invoice" || typeof payload.id !== "string" || !payload.id.startsWith("in_")) return;
  const observedAt = new Date().toISOString();
  const invoice = await stripe.invoices.retrieve(payload.id);
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

  let cardLast4: string | null = null;
  if (invoice.amount_paid > 0) {
    const payments = await stripe.invoicePayments.list({
      invoice: invoice.id, status: "paid", limit: 1,
      expand: ["data.payment.charge", "data.payment.payment_intent.latest_charge"],
    });
    cardLast4 = invoiceCardLastFour(payments.data[0]);
  }
  const saved = await db.rpc("platform_stripe_save_invoice", { p_invoice: {
    invoice_id: invoice.id, organization_id: data[0].organization_id, invoice_number: invoice.number,
    status: invoice.status, currency: invoice.currency, amount_due: invoice.amount_due,
    amount_paid: invoice.amount_paid, amount_remaining: invoice.amount_remaining, attempt_count: invoice.attempt_count,
    invoice_pdf: stripeInvoicePdf(invoice.invoice_pdf), card_last4: cardLast4, observed_at: observedAt,
    issued_at: new Date(invoice.created * 1000).toISOString(),
    failed_at: event.type === "invoice.payment_failed" ? new Date(event.created * 1000).toISOString() : null,
  } });
  if (saved.error) throw new Error("Could not persist Stripe invoice");
}
