/**
 * Guidon promo codes (migration 062). The redeem errors - the database's
 * own (redeem_promo_code) plus the app's - each shown as a sentence from
 * organizations.billing.promoErrors.
 */
export const PROMO_REDEEM_ERRORS = [
  "not_found",
  "inactive",
  "expired",
  "used_up",
  "already_redeemed",
  "has_better_plan",
  "too_many_attempts",
  "forbidden",
  "not_available",
  "failed",
] as const;
export type PromoRedeemError = (typeof PROMO_REDEEM_ERRORS)[number];

/** Codes: 3-40 characters, letters, digits, - and _, stored upper-case (062's CHECK). */
export const PROMO_CODE_RE = /^[A-Z0-9][A-Z0-9_-]{2,39}$/;

export function normalizePromoCode(code: string): string {
  return code.trim().toUpperCase();
}
