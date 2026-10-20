"use server";

import { revalidatePath } from "next/cache";
import { getOrgAccess, canManageOrg } from "@/lib/data/org-access";
import { hasDirectDatabase } from "@/lib/db/pool";
import { serviceDataClient } from "@/lib/data-client";
import { createRateLimitWindow } from "@/lib/ai/rate-limit-window";
import { PROMO_CODE_RE, normalizePromoCode, type PromoRedeemError } from "@/lib/billing/promo-codes";

/**
 * Redeems a Guidon promo code (migration 062): a plan for free for N days.
 * Owner/admin of the organization, Guidon Cloud only. The whole check-and-
 * grant is redeem_promo_code() in one transaction, run as the service role
 * - subscriptions are never writable by the organization itself.
 *
 * Attempts are capped per user so codes can't be guessed by trying many.
 */

const attempts = createRateLimitWindow(10, 10 * 60 * 1000);

export type RedeemPromoResult =
  | { ok: true; planId: string; grantedUntil: string }
  | { ok: false; error: PromoRedeemError };

export async function redeemPromoCode(organizationId: string, code: string): Promise<RedeemPromoResult> {
  if (hasDirectDatabase()) return { ok: false, error: "not_available" };
  const access = await getOrgAccess(organizationId);
  if (!access || !canManageOrg(access.role)) return { ok: false, error: "forbidden" };

  const normalized = normalizePromoCode(code);
  if (!PROMO_CODE_RE.test(normalized)) return { ok: false, error: "not_found" };

  if (attempts.isLimited(access.userId)) return { ok: false, error: "too_many_attempts" };
  attempts.record(access.userId);

  const { data, error } = await serviceDataClient().rpcRows<{
    error: PromoRedeemError | null;
    plan_id: string | null;
    granted_until: string | null;
  }>("redeem_promo_code", { p_code: normalized, p_organization_id: organizationId, p_user_id: access.userId });
  if (error || !data[0]) return { ok: false, error: "failed" };

  const row = data[0];
  if (row.error || !row.plan_id || !row.granted_until) return { ok: false, error: row.error ?? "failed" };

  revalidatePath(`/organizations/${organizationId}`, "layout");
  return { ok: true, planId: row.plan_id, grantedUntil: new Date(row.granted_until).toISOString() };
}
