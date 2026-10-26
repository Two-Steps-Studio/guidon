"use server";

import { revalidatePath } from "next/cache";
import { requireAdminAccess } from "@/lib/data/admin-access";
import { hasDirectDatabase } from "@/lib/db/pool";
import { isBillingConfigured } from "@/lib/billing/stripe";
import { applyPriceSync, previewPriceSync } from "@/lib/billing/price-sync";
import { tr } from "@/lib/i18n/server-errors";

/**
 * Applies what /admin/billing previewed. Reads Stripe again rather than
 * trusting the page's copy, and refuses while Stripe has two active prices
 * for one plan and period.
 */
export async function syncPricesFromStripe(): Promise<{ error: string | null; changed?: number }> {
  await requireAdminAccess();
  if (hasDirectDatabase()) return { error: await tr("Billing is not available for self-hosted installations.") };
  if (!isBillingConfigured()) return { error: await tr("Billing is not configured on this server yet.") };

  let plan;
  try {
    plan = await previewPriceSync();
  } catch (error) {
    console.error("Stripe price sync failed:", error);
    return { error: await tr("Could not read prices from Stripe. Check STRIPE_SECRET_KEY.") };
  }
  if (plan.errors.length > 0) return { error: plan.errors.join(" ") };

  const result = await applyPriceSync(plan.matches);
  if (result.error) return { error: result.error };
  revalidatePath("/admin/billing");
  return { error: null, changed: result.changed };
}
