import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * Copy of Guidon's src/lib/crypto/secret-box.ts, minus the "server-only"
 * import (Next.js-specific, meaningless outside the Next app) - kept as a
 * duplicate rather than a shared package because this bot is its own
 * npm package/process (same choice desktop/ made for not sharing
 * node_modules with the main app). Must stay byte-for-byte compatible:
 * this bot decrypts linked_api_key_encrypted rows the main app never
 * writes itself, and the main app decrypts webhook_url_encrypted rows
 * this bot never writes - both sides need the exact same algorithm/KDF
 * against the same AUTH_SECRET for either to ever read what the other wrote.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function deriveKey(secret: string, info: string): Buffer {
  return Buffer.from(hkdfSync("sha256", Buffer.from(secret, "utf8"), Buffer.alloc(0), Buffer.from(info, "utf8"), 32));
}

export function encryptSecret(plaintext: string, secret: string, info: string): string {
  const key = deriveKey(secret, info);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(".");
}

export function decryptSecret(stored: string, secret: string, info: string): string {
  const [ivB64, authTagB64, ciphertextB64] = stored.split(".");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Malformed encrypted secret");
  }

  const key = deriveKey(secret, info);
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));

  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextB64, "base64")), decipher.final()]);
  return plaintext.toString("utf8");
}
