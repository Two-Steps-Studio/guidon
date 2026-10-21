import * as Crypto from "expo-crypto";

/**
 * PKCE (RFC 7636, S256) for the mobile sign-in - must match
 * src/lib/auth/mobile-login-core.ts on the server:
 *   verifier  = 43-128 chars of [A-Za-z0-9._~-]
 *   challenge = BASE64URL(SHA256(verifier)), no padding (exactly 43 chars)
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** Base64url without padding. */
export function base64UrlEncode(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]! + ALPHABET[(n >> 6) & 63]! + ALPHABET[n & 63]!;
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i]! << 16;
    out += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]!;
  } else if (rest === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    out += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]! + ALPHABET[(n >> 6) & 63]!;
  }
  return out;
}

export function base64ToBase64Url(base64: string): string {
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomUrlSafe(byteCount: number): string {
  return base64UrlEncode(Crypto.getRandomBytes(byteCount));
}

const VERIFIER_RE = /^[A-Za-z0-9._~-]{43,128}$/;
const CHALLENGE_RE = /^[A-Za-z0-9_-]{43}$/;

export type PkcePair = { verifier: string; challenge: string };

export async function createPkcePair(): Promise<PkcePair> {
  // 64 random bytes -> 86 base64url characters.
  const verifier = randomUrlSafe(64);
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
    encoding: Crypto.CryptoEncoding.BASE64,
  });
  const challenge = base64ToBase64Url(digest);
  if (!VERIFIER_RE.test(verifier) || !CHALLENGE_RE.test(challenge)) {
    throw new Error("Could not prepare a secure sign-in request.");
  }
  return { verifier, challenge };
}
