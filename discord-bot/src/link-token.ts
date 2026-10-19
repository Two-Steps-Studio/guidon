import { createHmac } from "node:crypto";
import { config } from "./config.js";

/**
 * Signed, short-lived token embedded in the `/guidon-link` reply URL. The
 * bot only ever *signs* it; verification lives in the web app
 * (src/lib/discord/guild-link-token.ts), which opens the link. Same
 * construction as the app's own signed values (HMAC-SHA256 over the base64url
 * payload string, keyed by AUTH_SECRET) - keep the two files in sync.
 *
 * No user id in the payload on purpose: whoever is logged in to Guidon when
 * they open the link and confirm is the one linking the server.
 */
const TOKEN_TTL_SECONDS = 10 * 60;

export function createGuildLinkToken(guildId: string, guildName: string): string {
  const payload = {
    // Purpose claim: the web app only accepts tokens that say they are guild
    // links, so no other value signed with AUTH_SECRET can be replayed here.
    typ: "guild-link",
    guildId,
    guildName,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", config.authSecret).update(payloadB64).digest("base64url");
  return `${payloadB64}.${signature}`;
}

/**
 * Token for the `/guidon-login` reply URL: the Discord account asking to sign
 * in to a Guidon account (verified by verifyUserLoginToken in the web app).
 * The user id comes from the interaction, i.e. from Discord itself - so only
 * whoever ran the command as that account gets this link (the reply is
 * ephemeral).
 */
export function createUserLoginToken(discordUserId: string, discordUsername: string): string {
  const payload = {
    typ: "user-login",
    discordUserId,
    discordUsername,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", config.authSecret).update(payloadB64).digest("base64url");
  return `${payloadB64}.${signature}`;
}
