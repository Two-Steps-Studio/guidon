"use server";

import { deliverPasswordRecovery } from "@/lib/auth/password-recovery";
import { tr } from "@/lib/i18n/server-errors";

export type RequestPasswordResetResult = { error: string | null };

/** The public response never distinguishes existing accounts or delivery errors. */
export async function requestPasswordReset(email: string): Promise<RequestPasswordResetResult> {
  if (typeof email !== "string" || email.length > 254) return { error: null };
  try {
    if (await deliverPasswordRecovery(email) === "limited") {
      return { error: await tr("Too many reset requests for this email. Try again later.") };
    }
  } catch {
    console.error("Password recovery request failed");
  }
  return { error: null };
}
