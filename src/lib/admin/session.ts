import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { hasDirectDatabase } from "@/lib/db/pool";
import { serviceDataClient } from "@/lib/data-client";
import { createClient } from "@/lib/supabase-server";
import { SITE_URL } from "@/lib/site-url";
import { ADMIN_SESSION_COOKIE, ADMIN_SESSION_MAX_AGE_SECONDS, adminSessionProof, adminSsoProvider } from "./session-policy";

const digest = (value: string) => `\\x${createHash("sha256").update(value).digest("hex")}`;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function configuredAdminSsoProvider(): string | null {
  if (process.env.PLATFORM_ADMIN_ACCESS !== "sso" || hasDirectDatabase() || new URL(SITE_URL).protocol !== "https:") return null;
  return adminSsoProvider(process.env.PLATFORM_ADMIN_SSO_PROVIDER_ID);
}

export async function getAdminSsoProof(userId: string, accessToken?: string) {
  const provider = configuredAdminSsoProvider();
  if (!provider) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims(accessToken);
  return error ? null : adminSessionProof(data?.claims, userId, provider);
}

export async function isAdminAuthSessionActive(userId: string, sessionId: string): Promise<boolean> {
  const { data, error } = await serviceDataClient().rpc<boolean>("platform_admin_auth_session_active", {
    p_user_id: userId, p_session_id: sessionId,
  });
  return !error && data === true;
}

export async function hasActiveAdminSession(userId: string, grantId: string): Promise<boolean> {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (!token || !TOKEN.test(token)) return false;
  const proof = await getAdminSsoProof(userId);
  if (!proof?.mfaVerified) return false;
  const requestHeaders = await headers();
  const prefetch = requestHeaders.has("next-router-prefetch") || requestHeaders.get("purpose") === "prefetch" ||
    requestHeaders.get("sec-purpose")?.includes("prefetch");
  const { data, error } = await serviceDataClient().rpc<boolean>("platform_admin_check_session", {
    p_user_id: userId, p_grant_id: grantId, p_auth_session_id: proof.sessionId,
    p_auth_session_digest: digest(proof.sessionId), p_token_digest: digest(token), p_touch: !prefetch,
  });
  return !error && data === true;
}

/** Called only after a fresh TOTP challenge was verified against the SSO session. */
export async function createAdminSession(grantId: string, sessionId: string): Promise<boolean> {
  const token = randomBytes(32).toString("base64url");
  const now = new Date().toISOString();
  const { error } = await serviceDataClient().from("platform_admin_sessions").insert({
    grant_id: grantId, token_digest: digest(token), auth_session_digest: digest(sessionId),
    verified_at: now, last_seen_at: now,
  });
  if (error) return false;
  (await cookies()).set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
  });
  return true;
}

export async function revokeAdminSession(): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get(ADMIN_SESSION_COOKIE)?.value;
  if (token && TOKEN.test(token)) {
    const { error } = await serviceDataClient().from("platform_admin_sessions")
      .update({ revoked_at: new Date().toISOString() }).eq("token_digest", digest(token)).is("revoked_at", null);
    if (error) return false;
  }
  jar.set(ADMIN_SESSION_COOKIE, "", { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 0 });
  return true;
}
