import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { stripeInvoicePdf, type InvoicePaymentSummary } from "@/lib/billing/stripe-invoice-core";
import { AUDIT_UUID } from "@/lib/admin/audit";
import { requireAdminAccess } from "@/lib/data/admin-access";
import { serviceDataClient } from "@/lib/data-client";
import { hasAdminPermission } from "@/lib/admin/permissions";
import { hasDirectDatabase } from "@/lib/db/pool";
import { isBillingConfigured } from "@/lib/billing/stripe";
import { ImportInvoices } from "./import-invoices";

type InvoiceRow = {
  invoice_id: string; invoice_number: string | null; organization_id: string;
  status: string; currency: string; amount_due: number; amount_paid: number;
  amount_remaining: number; attempt_count: number; card_last4: string | null;
  invoice_pdf: string | null; issued_at: string; failed_at: string | null;
  payment_history: InvoicePaymentSummary[] | null;
};

export default async function AdminInvoicesPage({ searchParams }: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { role } = await requireAdminAccess("billing.read");
  const { org } = await searchParams;
  const query = serviceDataClient().from<InvoiceRow>("platform_stripe_invoices")
    .select("invoice_id, invoice_number, organization_id, status, currency, amount_due, amount_paid, amount_remaining, attempt_count, card_last4, invoice_pdf, issued_at, failed_at, payment_history")
    .order("issued_at", { ascending: false }).order("invoice_id").limit(100);
  const scoped = typeof org === "string" && AUDIT_UUID.test(org);
  if (scoped) query.eq("organization_id", org);
  const [{ data, error }, t, format, locale] = await Promise.all([query, getTranslations("admin.invoices"), getFormatter(), getLocale()]);
  if (error) throw new Error("Could not load Stripe invoices");
  const date = (value: string) => format.dateTime(new Date(value), { dateStyle: "medium", timeZone: "UTC" });
  const amount = (value: number, currency: string) => {
    const money = new Intl.NumberFormat(locale, { style: "currency", currency });
    // Stripe represents ISK and UGX with two decimal places for compatibility.
    const digits = ["isk", "ugx"].includes(currency) ? 2 : money.resolvedOptions().maximumFractionDigits ?? 2;
    return money.format(value / 10 ** digits);
  };

  return <div className="container mx-auto max-w-7xl space-y-4 px-4 py-8 sm:px-6">
    <Link href="/admin/billing" className="underline">{t("back")}</Link>
    <h2 className="text-2xl font-bold">{t("title")}</h2>
    <p className="text-muted-foreground">{t("description")}</p>
    {scoped && <Link href="/admin/billing/invoices" className="underline">{t("clear")}</Link>}
    {hasAdminPermission(role, "billing.invoices.import") && !hasDirectDatabase() && isBillingConfigured() &&
      <ImportInvoices key={scoped ? org : "all"} organizationId={scoped ? org : undefined} />}
    {data.length ? <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead><tr className="border-b text-left [&>th]:p-3">
          {(["invoice", "organization", "status", "due", "paid", "remaining", "attempts", "lastFailure", "card"] as const)
            .map(key => <th key={key} scope="col">{t(key)}</th>)}
        </tr></thead>
        <tbody className="divide-y">
          {data.map(invoice => {
            const pdf = stripeInvoicePdf(invoice.invoice_pdf);
            return <tr key={invoice.invoice_id} className="[&>td]:p-3">
              <td>{invoice.invoice_number ?? invoice.invoice_id}<br />{date(invoice.issued_at)}
                {pdf && <><br /><a href={pdf} target="_blank" rel="noopener noreferrer" className="underline">{t("pdf")}</a></>}
                {!!invoice.payment_history?.length && <details className="mt-2 min-w-44">
                  <summary className="cursor-pointer">{t("payments")}</summary>
                  <ul className="mt-1 space-y-1">{invoice.payment_history.map(payment => <li key={payment.id}>
                    {date(payment.recordedAt)} · {payment.status} · {payment.amount === null ? "—" : amount(payment.amount, payment.currency)}
                    {payment.last4 && ` · •••• ${payment.last4}`}
                  </li>)}</ul>
                </details>}
              </td>
              <td><Link className="underline" href={`/admin/billing/invoices?org=${invoice.organization_id}`}>{invoice.organization_id}</Link></td>
              <td>{invoice.status}</td>
              <td>{amount(invoice.amount_due, invoice.currency)}</td>
              <td>{amount(invoice.amount_paid, invoice.currency)}</td>
              <td>{amount(invoice.amount_remaining, invoice.currency)}</td>
              <td>{invoice.attempt_count}</td>
              <td>{invoice.failed_at ? date(invoice.failed_at) : "—"}</td>
              <td>{invoice.card_last4 ? `•••• ${invoice.card_last4}` : "—"}</td>
            </tr>;
          })}
        </tbody>
      </table>
    </div> : <p>{t("empty")}</p>}
  </div>;
}
