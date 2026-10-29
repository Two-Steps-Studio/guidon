import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies GitHub's `X-Hub-Signature-256` (HMAC-SHA256 of the raw body with
 * the App's webhook secret). Constant-time; false for a missing or
 * malformed header.
 */
export function verifyGithubSignature(rawBody: string, header: string | null, secret: string): boolean {
  // Buffer.from(hex) silently truncates malformed or odd-length input.
  // Validate the entire header before decoding its 32-byte digest.
  if (!header || header.length !== 71 || !/^sha256=[0-9a-fA-F]{64}$/.test(header)) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  const given = Buffer.from(header.slice("sha256=".length), "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
