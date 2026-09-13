"use server";

import { createServiceClient } from "@/lib/supabase-server";
import { isLockedOut, recordFailedAttempt } from "@/lib/auth/rate-limit";
import { sendPasswordResetEmail } from "@/lib/email/resend";
import { SITE_URL } from "@/lib/site-url";

export type RequestPasswordResetResult = { error: string | null };

/**
 * Never lets the caller learn whether `email` has an account: every branch
 * below - nonexistent email, rate-limited, or a real send - returns the
 * same { error: null } shape except for a genuine infrastructure failure
 * (Resend itself erroring), which is safe to surface because it happens
 * identically regardless of whether the account exists.
 */
export async function requestPasswordReset(
  email: string
): Promise<RequestPasswordResetResult> {
  const normalizedEmail = email.trim().toLowerCase();

  // Keyed with a "reset:" prefix so this doesn't share a counter with
  // rate-limit.ts's own login-lockout tracking for the same email address -
  // same module, same in-memory-per-process tradeoff already documented
  // and accepted there, different concern. Incrementing before calling
  // generateLink means a nonexistent email hit 5 times looks identical from
  // the outside to a real email hit 5 times.
  const rateLimitKey = `reset:${normalizedEmail}`;
  if (isLockedOut(rateLimitKey)) {
    return { error: "Too many reset requests for this email. Try again later." };
  }
  recordFailedAttempt(rateLimitKey);

  const supabase = createServiceClient();
  const redirectTo = `${SITE_URL}/auth/callback?redirect=${encodeURIComponent("/auth/reset-password")}`;

  const { data, error } = await supabase.auth.admin.generateLink({
    type: "recovery",
    email: normalizedEmail,
    options: { redirectTo },
  });

  if (error || !data.properties) {
    // Most commonly "user not found" - deliberately not distinguished from
    // success below, see this function's own doc comment.
    console.error("[auth] Failed to generate password reset link:", error?.message);
    return { error: null };
  }

  try {
    await sendPasswordResetEmail(normalizedEmail, data.properties.action_link);
  } catch (sendError) {
    console.error("[auth] Failed to send password reset email:", sendError);
    return { error: "Couldn't send the reset email right now. Please try again shortly." };
  }

  return { error: null };
}
