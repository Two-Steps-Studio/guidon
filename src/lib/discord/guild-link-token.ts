import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies the token discord-bot/ signs into the `/guidon-link` reply URL
 * (discord-bot/src/link-token.ts holds the signing side; keep them in sync).
 * Same envelope as the other short-lived signed values here: base64url(JSON
 * payload) + "." + base64url(HMAC-SHA256(payloadB64, AUTH_SECRET)).
 *
 * The payload carries no user id - whoever is signed in when opening the
 * link and confirming is the one linking the server; the role check happens
 * in the Server Action, not here.
 */

interface GuildLinkPayload {
  typ: string;
  guildId: string;
  guildName?: string | null;
  exp: number;
}

function signingSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET must be set to verify a Discord link token");
  }
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", signingSecret()).update(payload).digest("base64url");
}

/**
 * Returns the guild the token was minted for, or null if the token is
 * missing, malformed, unsigned by this AUTH_SECRET, or expired.
 */
export function verifyGuildLinkToken(
  token: string | null | undefined
): { guildId: string; guildName: string | null } | null {
  if (!token) return null;

  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;

  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expectedBuf = Buffer.from(sign(payloadB64));
  const sigBuf = Buffer.from(sig);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  let payload: GuildLinkPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (!payload || typeof payload !== "object") return null;
  // Purpose claim (see discord-bot/src/link-token.ts): reject anything else
  // that happens to be signed with the same AUTH_SECRET.
  if (payload.typ !== "guild-link") return null;
  if (typeof payload.guildId !== "string" || payload.guildId.length === 0 || typeof payload.exp !== "number") {
    return null;
  }
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;

  return {
    guildId: payload.guildId,
    guildName: typeof payload.guildName === "string" ? payload.guildName : null,
  };
}
