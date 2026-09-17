import { NextRequest, NextResponse } from "next/server";
import { getProjectAccess, canManageProject } from "@/lib/data/project-access";
import { createDiscordOAuthState } from "@/lib/discord/oauth-state";

/**
 * Starts the "Connect to Discord" flow from a project's Settings page.
 * Discord's bot-install OAuth2 flow lets the user pick which server to add
 * the bot to on Discord's own consent screen and returns that choice
 * (`guild_id`) directly in the callback redirect - unlike the GitHub App
 * flow (src/app/api/github/connect), there's no separate "pick a repo"
 * step needed here, and no code-for-token exchange either (the callback
 * never needs a user access token, only which guild was chosen), so this
 * needs only DISCORD_CLIENT_ID, not a client secret.
 *
 * Requesting the "Send Messages" permission (bit 0x800 = 2048) up front so
 * the bot can actually post in whatever channel a later /guidon-webhook
 * targets, without a second permission prompt.
 */
const SEND_MESSAGES_PERMISSION = 2048;

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const projectId = searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
  }

  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(
      `${origin}/projects/${projectId}/settings?discordError=${encodeURIComponent(
        "Discord integration is not configured on this server (DISCORD_CLIENT_ID)."
      )}`
    );
  }

  const access = await getProjectAccess(projectId);
  if (!access || !canManageProject(access.role)) {
    return NextResponse.redirect(
      `${origin}/projects/${projectId}/settings?discordError=${encodeURIComponent(
        "You do not have permission to connect this project to Discord."
      )}`
    );
  }

  const state = createDiscordOAuthState(projectId, access.userId);
  const authorizeUrl = new URL("https://discord.com/oauth2/authorize");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("permissions", String(SEND_MESSAGES_PERMISSION));
  authorizeUrl.searchParams.set("scope", "bot applications.commands");
  authorizeUrl.searchParams.set("redirect_uri", `${origin}/api/discord/callback`);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("state", state);

  return NextResponse.redirect(authorizeUrl.toString());
}
