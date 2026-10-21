import { createHash, randomBytes } from "node:crypto";

/**
 * Mobile app sign-in (migration 068) - the parts with no I/O, tested in
 * tests/auth/mobile-login.test.mjs. mobile-login.ts stores and redeems.
 */

/** The only place a code is ever sent: the app's own scheme. */
export const MOBILE_REDIRECT_URI = "guidon://auth";
export const MOBILE_CODE_TTL_MS = 5 * 60 * 1000;
export const MOBILE_KEY_NAME = "Mobile App";
export const MOBILE_KEY_SCOPES = [
  "tasks:read",
  "tasks:write",
  "tasks:status",
  "comments:write",
  "project:read",
  "project:write",
] as const;

const CHALLENGE_RE = /^[A-Za-z0-9_-]{43}$/;
// RFC 7636: 43-128 characters of [A-Z a-z 0-9 - . _ ~].
const VERIFIER_RE = /^[A-Za-z0-9._~-]{43,128}$/;

export function isValidCodeChallenge(value: unknown): value is string {
  return typeof value === "string" && CHALLENGE_RE.test(value);
}

export function isValidCodeVerifier(value: unknown): value is string {
  return typeof value === "string" && VERIFIER_RE.test(value);
}

/** S256: BASE64URL(SHA256(verifier)), no padding. */
export function challengeFromVerifier(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function verifierMatches(verifier: string, challenge: string): boolean {
  return isValidCodeVerifier(verifier) && isValidCodeChallenge(challenge) && challengeFromVerifier(verifier) === challenge;
}

export function newAuthCode(): string {
  return randomBytes(32).toString("base64url");
}

/** Only this hash is stored - a leaked table row can't be redeemed. */
export function hashAuthCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/** The redirect back into the app, with the one-time code and the app's own state. */
export function mobileRedirect(code: string, state: string): string {
  const url = new URL(MOBILE_REDIRECT_URI);
  url.searchParams.set("code", code);
  url.searchParams.set("state", state);
  return url.toString();
}
