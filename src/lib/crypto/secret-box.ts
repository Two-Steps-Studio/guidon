import "server-only";

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * Reversible at-rest encryption for secrets that must later be sent
 * somewhere (e.g. a GitHub access token used to call the GitHub API) -
 * distinct from `session-cookie.ts` and `local-auth.ts`, which only ever
 * hash or HMAC because they never need the original value back.
 *
 * The key is derived from AUTH_SECRET via HKDF with a fixed, feature-specific
 * info string, the same way `session-cookie.ts` and
 * `storage/providers/local.ts` already reuse AUTH_SECRET for unrelated
 * purposes - so connecting a GitHub repo needs no extra required env var.
 * Rotating AUTH_SECRET makes every stored token undecryptable at once; that
 * is the correct failure mode (same tradeoff session-cookie.ts documents for
 * sessions), not a bug to route around.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // recommended for GCM

function deriveKey(info: string): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET must be set to encrypt or decrypt stored secrets");
  }

  return Buffer.from(
    hkdfSync("sha256", Buffer.from(secret, "utf8"), Buffer.alloc(0), Buffer.from(info, "utf8"), 32)
  );
}

/**
 * Encrypts `plaintext` for storage. `info` scopes the derived key to one
 * feature (e.g. "github-token-v1") so different secret types under this
 * module never share a key even though they share AUTH_SECRET as the root.
 */
export function encryptSecret(plaintext: string, info: string): string {
  const key = deriveKey(info);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(".");
}

/** Inverse of `encryptSecret`. Throws if `info` doesn't match what encrypted it. */
export function decryptSecret(stored: string, info: string): string {
  const [ivB64, authTagB64, ciphertextB64] = stored.split(".");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Malformed encrypted secret");
  }

  const key = deriveKey(info);
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}
