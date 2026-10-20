"use server";

import { revalidatePath } from "next/cache";
import { requireAdminAccess } from "@/lib/data/admin-access";
import { serviceDataClient } from "@/lib/data-client";
import { PROMO_CODE_RE, normalizePromoCode } from "@/lib/billing/promo-codes";

/**
 * Instance admins create and switch off Guidon promo codes (migration 062).
 * Service role - promo_codes has no grants for anyone else.
 */

export interface PromoCodeInput {
  code: string;
  planId: string;
  durationDays: number;
  maxRedemptions: number | null;
  /** YYYY-MM-DD, the last day it can be used; null = no end. */
  expiresOn: string | null;
  note: string;
}

export async function createPromoCode(input: PromoCodeInput): Promise<{ error: string | null }> {
  const admin = await requireAdminAccess();
  const code = normalizePromoCode(input.code);
  if (!PROMO_CODE_RE.test(code)) return { error: "Codes are 3-40 letters, digits, - or _." };
  if (!Number.isInteger(input.durationDays) || input.durationDays < 1 || input.durationDays > 3650) {
    return { error: "Duration must be 1-3650 days." };
  }
  if (input.maxRedemptions !== null && (!Number.isInteger(input.maxRedemptions) || input.maxRedemptions < 1)) {
    return { error: "Max uses must be a whole number of at least 1, or empty for unlimited." };
  }
  let expiresAt: string | null = null;
  if (input.expiresOn) {
    // The end of that day, UTC: "valid until 31 Dec" includes 31 Dec.
    const end = new Date(`${input.expiresOn}T23:59:59Z`);
    if (Number.isNaN(end.getTime())) return { error: "Invalid end date." };
    expiresAt = end.toISOString();
  }

  const db = serviceDataClient();
  const { data: plan } = await db.from<{ id: string }>("plans").select("id").eq("id", input.planId).maybeSingle();
  if (!plan || plan.id === "free") return { error: "Pick a paid plan." };

  const { error } = await db.from("promo_codes").insert({
    code,
    plan_id: plan.id,
    duration_days: input.durationDays,
    max_redemptions: input.maxRedemptions,
    expires_at: expiresAt,
    note: input.note.trim().slice(0, 500) || null,
    created_by: admin.id,
  });
  if (error) return { error: error.code === "23505" ? "That code already exists." : error.message };

  revalidatePath("/admin/promo-codes");
  return { error: null };
}

export async function setPromoCodeActive(id: string, active: boolean): Promise<{ error: string | null }> {
  await requireAdminAccess();
  const { data, error } = await serviceDataClient().from("promo_codes").update({ active }).eq("id", id).select<{ id: string }>("id");
  if (error) return { error: error.message };
  if (!data.length) return { error: "Code not found." };
  revalidatePath("/admin/promo-codes");
  return { error: null };
}
