import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed, short-lived token in the link `/guidon link` replies with: it names
 * the Slack channel to connect, and whoever is signed in to Guidon when they
 * open it and confirm becomes the one the channel acts as. Same envelope as
 * the Discord guild link (src/lib/discord/guild-link-token.ts) with its own
 * purpose claim, so neither token works in the other's place.
 *
 * No `server-only` marker, so tests/slack.test.mjs can import it directly;
 * the secret comes from the caller (AUTH_SECRET in the app).
 */

export const SLACK_LINK_TTL_SECONDS = 10 * 60;
const PURPOSE = "slack-channel-link";

export interface SlackChannelRef {
  teamId: string;
  teamName: string | null;
  channelId: string;
  channelName: string | null;
}

function sign(payloadB64: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadB64).digest("base64url");
}

export function createSlackLinkToken(channel: SlackChannelRef, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): string {
  if (!secret) throw new Error("A secret is required to sign a Slack link token");
  const payload = { typ: PURPOSE, ...channel, exp: nowSeconds + SLACK_LINK_TTL_SECONDS };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${payloadB64}.${sign(payloadB64, secret)}`;
}

/** The channel the token was minted for, or null if it's malformed, not signed with `secret`, or expired. */
export function verifySlackLinkToken(
  token: string | null | undefined,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): SlackChannelRef | null {
  if (!token || !secret) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payloadB64 = token.slice(0, dot);
  const expected = Buffer.from(sign(payloadB64, secret));
  const actual = Buffer.from(token.slice(dot + 1));
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object" || payload.typ !== PURPOSE) return null;
  const { teamId, channelId, exp } = payload;
  if (typeof teamId !== "string" || !teamId || typeof channelId !== "string" || !channelId) return null;
  if (typeof exp !== "number" || exp < nowSeconds) return null;
  return {
    teamId,
    channelId,
    teamName: typeof payload.teamName === "string" ? payload.teamName : null,
    channelName: typeof payload.channelName === "string" ? payload.channelName : null,
  };
}
