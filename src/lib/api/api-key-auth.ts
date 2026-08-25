import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { hashApiKey, isValidApiKeyFormat } from "./api-keys";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withServiceRole } from "@/lib/db/session";

export interface ApiKeyIdentity {
  userId: string;
  apiKeyId: string;
  scopes: string[];
}

/**
 * Resolves a bearer token to the API key's owner, or null if it's missing,
 * malformed, unknown, or revoked. Updates last_used_at as a side effect -
 * every caller of this function is about to actually use the key, there is
 * no separate "check without using" call site in this codebase.
 */
export async function authenticateApiKey(authHeader: string | null): Promise<ApiKeyIdentity | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;

  const rawKey = authHeader.slice("Bearer ".length).trim();
  if (!isValidApiKeyFormat(rawKey)) return null;

  const keyHash = hashApiKey(rawKey);

  if (hasDirectDatabase()) {
    const result = await withServiceRole(({ query }) =>
      query(
        "SELECT id, user_id, scopes FROM api_keys WHERE key_hash = $1 AND revoked_at IS NULL",
        [keyHash]
      )
    );
    const key = result.rows[0] as { id: string; user_id: string; scopes: string[] } | undefined;
    if (!key) return null;

    await withServiceRole(({ query }) =>
      query("UPDATE api_keys SET last_used_at = now() WHERE id = $1", [key.id])
    );
    return { userId: key.user_id, apiKeyId: key.id, scopes: key.scopes };
  }

  const { createServiceClient } = await import("@/lib/supabase-server");
  const supabase = createServiceClient();

  const { data: key } = await supabase
    .from("api_keys")
    .select("id, user_id, scopes")
    .eq("key_hash", keyHash)
    .is("revoked_at", null)
    .single();

  if (!key) return null;

  await supabase.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id);
  return { userId: key.user_id, apiKeyId: key.id, scopes: key.scopes };
}

/**
 * A Supabase client that operates under RLS as `userId` - for the hosted
 * path only (self-hosted route handlers call withUser(userId, ...)
 * directly instead, the same mechanism every other identity in this
 * codebase already uses; there is nothing for this function to do there).
 *
 * Mints a short-lived (60s) custom JWT with the same claim shape GoTrue's
 * own session tokens carry ({ sub, role: "authenticated", exp }), signed
 * with SUPABASE_JWT_SECRET. PostgREST decodes it exactly like a real
 * session token, so auth.uid() resolves to userId and every existing RLS
 * policy applies unchanged - no authorization logic is reimplemented here.
 */
export async function getApiUserClient(userId: string) {
  const jwt = await signApiJwt(userId);

  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}

const JWT_TTL_SECONDS = 60;

async function signApiJwt(userId: string): Promise<string> {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    throw new Error("SUPABASE_JWT_SECRET must be set to authenticate API key requests on Guidon Cloud.");
  }

  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    sub: userId,
    role: "authenticated",
    exp: Math.floor(Date.now() / 1000) + JWT_TTL_SECONDS,
  };

  const encoder = new TextEncoder();
  const toBase64Url = (bytes: Uint8Array) => {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };

  const headerB64 = toBase64Url(encoder.encode(JSON.stringify(header)));
  const payloadB64 = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(signingInput));
  const sigB64 = toBase64Url(new Uint8Array(signature));

  return `${signingInput}.${sigB64}`;
}
