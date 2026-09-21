"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageProject, getProjectAccess } from "@/lib/data/project-access";
import { linkDiscordGuildToProject } from "@/lib/data/discord-integration";
import { verifyGuildLinkToken } from "@/lib/discord/guild-link-token";

export type AttachGuildState = { error: string | null };

const LINK_EXPIRED_ERROR = "This link has expired or is invalid. Run /guidon-link in your Discord server again.";
const NO_PERMISSION_ERROR = "You do not have permission to change this project's Discord integration.";
const GENERIC_ERROR = "Could not link the Discord server. Please try again.";

/**
 * Confirms the project picker on /discord/link. The client sends only the
 * signed token and the chosen project id - the guild id is taken from the
 * re-verified token, never from the client, and the caller's role on the
 * project is re-checked here (RLS re-enforces it inside the link itself).
 * Success redirects to the project's settings page, where the
 * `discordConnected` banner confirms it.
 */
export async function attachGuildToProject(token: string, projectId: string): Promise<AttachGuildState> {
  if (typeof token !== "string" || typeof projectId !== "string" || !projectId) {
    return { error: GENERIC_ERROR };
  }

  let result: Awaited<ReturnType<typeof linkDiscordGuildToProject>>;
  try {
    const guild = verifyGuildLinkToken(token);
    if (!guild) return { error: LINK_EXPIRED_ERROR };

    const access = await getProjectAccess(projectId);
    if (!access || !canManageProject(access.role)) return { error: NO_PERMISSION_ERROR };

    result = await linkDiscordGuildToProject(projectId, access.userId, guild.guildId, guild.guildName?.trim() || null);
  } catch (error) {
    console.error("attachGuildToProject failed:", error);
    return { error: GENERIC_ERROR };
  }

  if (!result.ok) return { error: result.error };

  revalidatePath(`/projects/${projectId}/settings`);
  // redirect() works by throwing, so it must stay outside the try/catch above.
  redirect(`/projects/${projectId}/settings?discordConnected=1`);
}
