import { NextRequest, NextResponse } from "next/server";
import { verifyDiscordOAuthState } from "@/lib/discord/oauth-state";
import { linkDiscordGuildViaOAuth } from "@/lib/data/discord-integration";

/**
 * Callback for the "Connect to Discord" flow (src/app/api/discord/connect).
 * `guild_id` arrives directly in Discord's redirect for the bot-install
 * scope - no code-for-token exchange needed, see connect/route.ts's own
 * comment for why. `code` is present but unused for the same reason.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);

  const guildId = searchParams.get("guild_id");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error_description") ?? searchParams.get("error");

  const verified = verifyDiscordOAuthState(state);

  const failure = (message: string) => {
    const redirectPath = verified ? `/projects/${verified.projectId}/settings` : "/projects";
    return NextResponse.redirect(`${origin}${redirectPath}?discordError=${encodeURIComponent(message)}`);
  };

  if (oauthError) return failure(oauthError);
  if (!guildId || !verified) return failure("Discord sign-in did not complete.");

  try {
    await linkDiscordGuildViaOAuth(verified.projectId, verified.userId, guildId);
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Could not connect to Discord.");
  }

  return NextResponse.redirect(`${origin}/projects/${verified.projectId}/settings?discordConnected=1`);
}
