import "server-only";

import { createServiceClient } from "@/lib/supabase-server";
import { isLockedOut, recordFailedAttempt } from "@/lib/auth/rate-limit";
import { sendPasswordResetEmail } from "@/lib/email/resend";
import { SITE_URL } from "@/lib/site-url";
import { DEFAULT_LOCALE, isSupportedLocale } from "@/i18n/locales";

export type PasswordRecoveryStatus = "sent" | "limited" | "unavailable";

export async function deliverPasswordRecovery(
  email: string,
  expectedUserId?: string,
): Promise<PasswordRecoveryStatus> {
  const normalizedEmail = email.trim().toLowerCase();
  const rateLimitKey = `reset:${normalizedEmail}`;
  if (isLockedOut(rateLimitKey)) return "limited";
  recordFailedAttempt(rateLimitKey);

  const supabase = createServiceClient();
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "recovery",
    email: normalizedEmail,
  });
  if (error || !data.properties?.hashed_token || !data.user ||
      (expectedUserId && expectedUserId !== data.user.id)) {
    // The address may have been reassigned between the admin lookup and link
    // generation. Do not send a link for a different account.
    return "unavailable";
  }

  // Admin-generated links have no browser PKCE verifier. The existing
  // recovery route verifies the hash through Supabase before opening the form.
  const resetLink = `${SITE_URL}/auth/reset-password/verify?token_hash=${encodeURIComponent(
    data.properties.hashed_token
  )}&type=recovery`;
  const { data: profile } = await supabase.from("profiles").select("locale")
    .eq("id", data.user.id).maybeSingle();
  const locale = profile?.locale && isSupportedLocale(profile.locale) ? profile.locale : DEFAULT_LOCALE;

  try {
    await sendPasswordResetEmail(normalizedEmail, resetLink, locale);
    return "sent";
  } catch {
    // Provider errors can include the recipient or message contents.
    console.error("Password recovery email delivery failed");
    return "unavailable";
  }
}
