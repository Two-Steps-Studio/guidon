import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies the tokens discord-bot/ signs into the `/guidon-link` and
 * `/guidon-login` reply URLs
 * (discord-bot/src/link-token.ts holds the signing side; keep them in sync).
 * Same envelope as the other short-lived signed values here: base64url(JSON
 * payload) + "." + base64url(HMAC-SHA256(payloadB64, AUTH_SECRET)).
 *
 * Neither payload carries a Guidon user id - whoever is signed in when
 * opening the link and confirming is the one linking; role checks happen in
 * the Server Actions, not here.
 */

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
 * Checks the signature and expiry of a token and its purpose claim (`typ`),
 * returning its payload. Purpose claims keep one kind of token (or any other
 * value signed with AUTH_SECRET) from being replayed as another.
 */
function decodeToken(token: string | null | undefined, typ: string): Record<string, unknown> | null {
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

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (!payload || typeof payload !== "object") return null;
  const fields = payload as Record<string, unknown>;
  if (fields.typ !== typ) return null;
  if (typeof fields.exp !== "number" || fields.exp < Math.floor(Date.now() / 1000)) return null;
  return fields;
}

/**
 * Returns the guild the token was minted for, or null if the token is
 * missing, malformed, unsigned by this AUTH_SECRET, or expired.
 */
export function verifyGuildLinkToken(
  token: string | null | undefined
): { guildId: string; guildName: string | null } | null {
  const payload = decodeToken(token, "guild-link");
  if (!payload || typeof payload.guildId !== "string" || payload.guildId.length === 0) return null;
  return {
    guildId: payload.guildId,
    guildName: typeof payload.guildName === "string" ? payload.guildName : null,
  };
}

/**
 * The `/guidon-login` token (discord-bot/src/link-token.ts,
 * createUserLoginToken): the Discord account that asked to sign in. Discord
 * itself vouches for the user id - the bot reads it from the interaction, so
 * holding this link means having run the command as that account.
 */
export function verifyUserLoginToken(
  token: string | null | undefined
): { discordUserId: string; discordUsername: string | null } | null {
  const payload = decodeToken(token, "user-login");
  if (!payload || typeof payload.discordUserId !== "string" || !/^\d{1,32}$/.test(payload.discordUserId)) return null;
  return {
    discordUserId: payload.discordUserId,
    discordUsername: typeof payload.discordUsername === "string" ? payload.discordUsername : null,
  };
}
