import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Signed, short-lived `state` for the "Connect to Discord" flow
 * (src/app/api/discord/connect + callback) - same shape and same reasoning
 * as src/lib/github/oauth-state.ts's own doc comment: carries which
 * *project* the connection is for, only needs to survive one redirect round
 * trip, gets its own minimal HMAC envelope rather than reusing
 * session-cookie.ts's.
 */

const STATE_TTL_SECONDS = 10 * 60;

interface DiscordOAuthState {
  projectId: string;
  userId: string;
  nonce: string;
  exp: number;
}

function signingSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET must be set to start the Discord OAuth flow");
  }
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", signingSecret()).update(payload).digest("base64url");
}

/**
 * Creates a signed state string embedding `projectId` and `userId`, to send
 * to Discord. `userId` is included (github's oauth-state.ts doesn't need
 * it - it re-derives the caller from the session cookie in the callback)
 * because the Discord callback creates a new API key owned by whoever
 * started the flow, and re-reading the session at callback time would
 * silently attribute the key to a *different* signed-in user if the
 * browser's session changed between the two requests - the state itself is
 * the source of truth for "who clicked Connect", not whatever session
 * happens to be active when Discord redirects back.
 */
export function createDiscordOAuthState(projectId: string, userId: string): string {
  const payload: DiscordOAuthState = {
    projectId,
    userId,
    nonce: randomBytes(16).toString("hex"),
    exp: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${payloadB64}.${sign(payloadB64)}`;
}

/**
 * Verifies a `state` returned by Discord's callback and returns the
 * `projectId`/`userId` it was minted for, or null if missing, malformed,
 * unsigned by this AUTH_SECRET, or expired.
 */
export function verifyDiscordOAuthState(state: string | null | undefined): { projectId: string; userId: string } | null {
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

  let payload: DiscordOAuthState;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (typeof payload.projectId !== "string" || typeof payload.userId !== "string" || typeof payload.exp !== "number") {
    return null;
  }
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;

  return { projectId: payload.projectId, userId: payload.userId };
}
