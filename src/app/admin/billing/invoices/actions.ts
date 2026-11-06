"use server";

import { revalidatePath } from "next/cache";
import { auditAdminMutation, AUDIT_UUID } from "@/lib/admin/audit";
import { getStripe, isBillingConfigured } from "@/lib/billing/stripe";
import { importStripeInvoiceBatch } from "@/lib/billing/stripe-invoice-sync";
import { hasDirectDatabase } from "@/lib/db/pool";

export async function importOrganizationInvoices(organizationId: string, after: string | null) {
  return auditAdminMutation<{ error: string | null; next?: string | null; imported?: number }>(
    "billing.invoices.import", organizationId, async (_admin, changes) => {
      if (typeof organizationId !== "string" || !AUDIT_UUID.test(organizationId) ||
          (after !== null && (typeof after !== "string" || !/^in_[a-z\d]{1,100}$/i.test(after)))) return { error: "invalid" };
      if (hasDirectDatabase() || !isBillingConfigured()) return { error: "unavailable" };
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
