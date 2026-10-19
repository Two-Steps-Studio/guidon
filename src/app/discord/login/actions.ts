"use server";

import { getCurrentUser } from "@/lib/data/current-user";
import { linkDiscordUser } from "@/lib/data/discord-user-link";
import { verifyUserLoginToken } from "@/lib/discord/guild-link-token";

export type DiscordLoginState = { ok: boolean; error: string | null };

const LINK_EXPIRED_ERROR = "This link has expired or is invalid. Run /guidon-login in Discord again.";
const GENERIC_ERROR = "Could not sign in the Discord account. Please try again.";

/**
 * Confirms /discord/login. The Discord account comes only from the
 * re-verified token, never from the client; the Guidon account is the session.
 */
export async function confirmDiscordLogin(token: string): Promise<DiscordLoginState> {
  if (typeof token !== "string") return { ok: false, error: GENERIC_ERROR };
  try {
    const discord = verifyUserLoginToken(token);
    if (!discord) return { ok: false, error: LINK_EXPIRED_ERROR };
    const user = await getCurrentUser();
    const result = await linkDiscordUser(user.id, discord.discordUserId, discord.discordUsername?.trim() || null);
    return result.ok ? { ok: true, error: null } : { ok: false, error: result.error };
  } catch (error) {
    console.error("confirmDiscordLogin failed:", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}
