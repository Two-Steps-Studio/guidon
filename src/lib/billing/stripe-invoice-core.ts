import type Stripe from "stripe";

export const INVOICE_EVENTS = new Set([
  "invoice.finalized", "invoice.updated", "invoice.paid", "invoice.payment_failed", "invoice.voided", "invoice.marked_uncollectible",
]);

export function stripeInvoicePdf(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".stripe.com") && !url.username && !url.password
      ? url.href : null;
  } catch {
    return null;
  }
}

export function invoiceCardLastFour(payment: Stripe.InvoicePayment | undefined) {
  if (!payment || payment.status !== "paid") return null;
  const intent = payment.payment.payment_intent;
  const charge = payment.payment.type === "charge" ? payment.payment.charge
    : typeof intent === "object" ? intent.latest_charge : null;
  const digits = typeof charge === "object" ? charge?.payment_method_details?.card?.last4 : undefined;
  return typeof digits === "string" && /^\d{4}$/.test(digits) ? digits : null;
}
