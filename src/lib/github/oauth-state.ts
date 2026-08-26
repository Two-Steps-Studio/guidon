import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Signed, short-lived `state` for the GitHub "connect repo" OAuth flow
 * (src/app/api/github/connect + callback). Not the same thing as
 * session-cookie.ts's session token - this carries which *project* the
 * connection is for and only needs to survive one redirect round trip, not
 * 30 days - so it gets its own minimal HMAC envelope instead of reusing that
 * module's shape.
 */

const STATE_TTL_SECONDS = 10 * 60;

interface GithubOAuthState {
  projectId: string;
  nonce: string;
  exp: number;
}

function signingSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET must be set to start the GitHub OAuth flow");
  }
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", signingSecret()).update(payload).digest("base64url");
}

/** Creates a signed state string embedding `projectId`, to send to GitHub. */
export function createGithubOAuthState(projectId: string): string {
  const payload: GithubOAuthState = {
    projectId,
    nonce: randomBytes(16).toString("hex"),
    exp: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${payloadB64}.${sign(payloadB64)}`;
}

/**
 * Verifies a `state` returned by GitHub's callback and returns the
 * `projectId` it was minted for, or null if it is missing, malformed,
 * unsigned by this AUTH_SECRET, or expired.
 */
export function verifyGithubOAuthState(state: string | null | undefined): string | null {
  if (!state) return null;

  const dot = state.lastIndexOf(".");
  if (dot <= 0) return null;

  const payloadB64 = state.slice(0, dot);
  const sig = state.slice(dot + 1);

  const expectedSig = sign(payloadB64);
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  let payload: GithubOAuthState;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (typeof payload.projectId !== "string" || typeof payload.exp !== "number") return null;
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;

  return payload.projectId;
}
