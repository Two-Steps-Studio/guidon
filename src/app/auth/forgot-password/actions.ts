"use server";

import { createServiceClient } from "@/lib/supabase-server";
import { isLockedOut, recordFailedAttempt } from "@/lib/auth/rate-limit";
import { sendPasswordResetEmail } from "@/lib/email/resend";
import { SITE_URL } from "@/lib/site-url";
import { DEFAULT_LOCALE, isSupportedLocale } from "@/i18n/locales";

export type RequestPasswordResetResult = { error: string | null };

/**
 * Never lets the caller learn whether `email` has an account: the only
 * response that ever differs from the generic { error: null } "success" is
 * the rate-limit message below, which fires identically whether or not the
 * email exists. A nonexistent email, a real email that got a working
 * reset link sent, and a real email where the Resend send itself failed
 * (bad API key, unverified sending domain, Resend outage) all return the
 * exact same { error: null } - distinguishing the last case would leak
 * account existence for as long as the underlying send problem persists.
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

  const { data, error } = await supabase.auth.admin.generateLink({
    type: "recovery",
    email: normalizedEmail,
  });

  if (error || !data.properties) {
    // Most commonly "user not found" - deliberately not distinguished from
    // success below, see this function's own doc comment.
    console.error("[auth] Failed to generate password reset link:", error?.message);
    return { error: null };
  }

  // Deliberately NOT emailing data.properties.action_link (GoTrue's own
  // hosted /verify-then-redirect endpoint) - this app's Supabase clients
  // are hard-configured for the PKCE flow (@supabase/ssr sets
  // flowType: "pkce" unconditionally), but admin.generateLink() never
  // involves a browser, so no PKCE code_verifier ever exists for this
  // link. Visiting action_link would leave GoTrue with no PKCE state to
  // exchange, so /auth/callback's exchangeCodeForSession(code) - which
  // only reads a ?code= param - would never see a usable one. Instead,
  // this points straight at our own reset-password page with the raw
  // hashed_token, which that page verifies directly via verifyOtp()
  // (no PKCE involved at all, the pattern Supabase documents for
  // admin-generated links).
  const resetLink = `${SITE_URL}/auth/reset-password/verify?token_hash=${encodeURIComponent(
    data.properties.hashed_token
  )}&type=recovery`;

  // Best-effort: a missing profile row (not yet created, or created before
  // migration 031 added the column) falls back to DEFAULT_LOCALE rather
  // than failing the whole reset flow - the email still needs to go out
  // either way.
  const { data: profile } = await supabase
    .from("profiles")
    .select("locale")
    .eq("id", data.user.id)
    .maybeSingle();
  const locale =
    profile?.locale && isSupportedLocale(profile.locale)
      ? profile.locale
      : DEFAULT_LOCALE;

  try {
    await sendPasswordResetEmail(normalizedEmail, resetLink, locale);
  } catch (sendError) {
    // Swallowed the same way a nonexistent email is above: surfacing this
    // distinctly from success would turn any systemic Resend outage or
    // misconfiguration (bad RESEND_API_KEY, unverified sending domain)
    // into a perfect enumeration oracle for as long as it lasted - every
    // real account would hit this branch, every fake one the generic
    // success below. Ops visibility comes from this log line alone, not
    // the response.
    console.error("[auth] Failed to send password reset email:", sendError);
  }

  return { error: null };
}
