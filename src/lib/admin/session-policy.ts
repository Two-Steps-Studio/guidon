export const ADMIN_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
export const ADMIN_SESSION_COOKIE = "__Host-guidon-admin";
export const ADMIN_SIGN_IN_PATH = "/auth/admin";

const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

export function adminSsoProvider(value: string | undefined): string | null {
  return value && UUID.test(value) ? value.toLowerCase() : null;
}

/** Only call with claims already verified by Supabase Auth. */
export function adminSessionProof(claims: unknown, userId: string, provider: string) {
  if (!claims || typeof claims !== "object") return null;
  const jwt = claims as Record<string, unknown>;
  if (jwt.sub !== userId || jwt.role !== "authenticated" || jwt.is_anonymous === true) return null;
  if (typeof jwt.session_id !== "string" || !UUID.test(jwt.session_id) || !Array.isArray(jwt.amr)) return null;
  const methods = jwt.amr.filter((value): value is Record<string, unknown> => !!value && typeof value === "object");
  if (!methods.some(entry => entry.method === "sso/saml" && entry.provider === provider)) return null;
  return {
    sessionId: jwt.session_id,
    mfaVerified: jwt.aal === "aal2" && methods.some(entry => entry.method === "totp"),
  };
}
