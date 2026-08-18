import "server-only";

/**
 * Signed session cookie for self-hosted auth (TODO.md §8, §30 "Self-hosting").
 *
 * On Supabase, a session is a JWT that GoTrue issued and PostgREST verifies —
 * neither exists in a self-hosted install with no Supabase software running.
 * This is the replacement for that pair: a cookie the server signs on login
 * and re-verifies on every request, with no database round trip and no
 * external service.
 *
 * Built on Web Crypto (`crypto.subtle`), not `node:crypto`, because this
 * module is imported from both `src/proxy.ts` (Next middleware, which can run
 * on the Edge runtime) and Server Actions (Node runtime). `crypto.subtle` is
 * the one HMAC implementation available in both, and `SubtleCrypto.verify`
 * does the signature comparison in constant time itself — there is no manual
 * timing-safe-equal to get wrong here.
 *
 * The cookie carries no secrets beyond the user id: `{ sub, exp }`, base64url,
 * HMAC-SHA256'd with AUTH_SECRET (the same variable already used to sign
 * local storage URLs — see src/lib/storage/providers/local.ts). Losing
 * AUTH_SECRET invalidates every session at once; that is the correct failure
 * mode, not a bug to work around.
 */

export const SESSION_COOKIE_NAME = "guidon-session";

/** 30 days. Self-hosted installs have no refresh-token dance (yet) — a
 * session is a flat expiry, and expiring means signing in again. */
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

type SessionPayload = {
  sub: string; // user id (uuid)
  exp: number; // unix seconds
};

function encoder() {
  return new TextEncoder();
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function signingSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET must be set to sign or verify local sessions");
  }
  return secret;
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder().encode(signingSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

/** Signs a fresh session for `userId`. Returns the cookie value to store. */
export async function signSession(userId: string): Promise<{ value: string; expiresAt: Date }> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload: SessionPayload = { sub: userId, exp };
  const payloadB64 = toBase64Url(encoder().encode(JSON.stringify(payload)));

  const key = await hmacKey();
  const signature = await crypto.subtle.sign("HMAC", key, encoder().encode(payloadB64));
  const sigB64 = toBase64Url(new Uint8Array(signature));

  return { value: `${payloadB64}.${sigB64}`, expiresAt: new Date(exp * 1000) };
}

/**
 * Verifies a cookie value and returns the user id, or null if it is missing,
 * malformed, unsigned by this AUTH_SECRET, or expired. Never throws on bad
 * input — an invalid session must fail closed like "not signed in", not like
 * a server error.
 */
export async function verifySessionCookie(cookieValue: string | undefined | null): Promise<string | null> {
  if (!cookieValue) return null;

  const dot = cookieValue.lastIndexOf(".");
  if (dot <= 0) return null;

  const payloadB64 = cookieValue.slice(0, dot);
  const sigB64 = cookieValue.slice(dot + 1);

  let signatureBytes: Uint8Array<ArrayBuffer>;
  try {
    signatureBytes = fromBase64Url(sigB64);
  } catch {
    return null;
  }

  const key = await hmacKey();
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    signatureBytes,
    encoder().encode(payloadB64)
  );
  if (!valid) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadB64)));
  } catch {
    return null;
  }

  if (typeof payload.sub !== "string" || typeof payload.exp !== "number") return null;
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;

  return payload.sub;
}
