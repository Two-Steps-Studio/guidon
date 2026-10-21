import "server-only";

import { serviceDataClient } from "@/lib/data-client";
import { generateApiKey, hashApiKey, keyPrefix } from "@/lib/api/api-keys";
import {
  MOBILE_CODE_TTL_MS,
  MOBILE_KEY_NAME,
  MOBILE_KEY_SCOPES,
  hashAuthCode,
  newAuthCode,
  verifierMatches,
} from "@/lib/auth/mobile-login-core";

/**
 * Mobile app sign-in (migration 068): /auth/mobile-login issues a one-time
 * code for the signed-in browser session, POST /api/v1/auth/mobile/token
 * trades it - with the PKCE verifier only the app knows - for an API key.
 *
 * Service role throughout: mobile_auth_codes has no grants for anyone else,
 * and api_keys.human_client may only be set by the server (039). Every user
 * id here comes from a verified session (create) or from the code row
 * (redeem), never from input.
 */

export async function createMobileAuthCode(userId: string, codeChallenge: string): Promise<string> {
  const code = newAuthCode();
  const db = serviceDataClient();
  // Expired codes of anyone are cleared on the way - the table stays tiny.
  await db.from("mobile_auth_codes").delete().lt("expires_at", new Date().toISOString());
  const { error } = await db.from("mobile_auth_codes").insert({
    code_hash: hashAuthCode(code),
    user_id: userId,
    code_challenge: codeChallenge,
    expires_at: new Date(Date.now() + MOBILE_CODE_TTL_MS).toISOString(),
  });
  if (error) throw new Error(`Could not start the mobile sign-in: ${error.message}`);
  return code;
}

export type MobileTokenResult = { apiKey: string; email: string; name: string | null } | null;

/**
 * One try per code: the row is marked used before the verifier is checked,
 * so a wrong verifier burns the code instead of allowing guesses.
 */
export async function redeemMobileAuthCode(code: string, codeVerifier: string): Promise<MobileTokenResult> {
  const db = serviceDataClient();
  const { data: rows, error } = await db
    .from<{ user_id: string; code_challenge: string }>("mobile_auth_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("code_hash", hashAuthCode(code))
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("user_id, code_challenge");
  if (error || rows.length !== 1) return null;
  const { user_id: userId, code_challenge: challenge } = rows[0];
  if (!verifierMatches(codeVerifier, challenge)) return null;

  const { data: profile } = await db
    .from<{ email: string; full_name: string | null }>("profiles")
    .select("email, full_name")
    .eq("id", userId)
    .maybeSingle();

  // One key per person for the app: signing in again replaces the old one.
  await db
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("name", MOBILE_KEY_NAME)
    .is("revoked_at", null);

  const apiKey = generateApiKey();
  const { error: insertError } = await db.from("api_keys").insert({
    user_id: userId,
    name: MOBILE_KEY_NAME,
    key_prefix: keyPrefix(apiKey),
    key_hash: hashApiKey(apiKey),
    scopes: [...MOBILE_KEY_SCOPES],
    human_client: true,
  });
  if (insertError) return null;

  return { apiKey, email: profile?.email ?? "", name: profile?.full_name ?? null };
}
