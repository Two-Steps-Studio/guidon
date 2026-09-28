"use server";

import { revalidatePath } from "next/cache";
import { canManageProject, getProjectAccess } from "@/lib/data/project-access";
import { getDiscordIntegrationInfo, saveDiscordWebhookUrl, clearDiscordWebhookUrl, disconnectDiscordGuild } from "@/lib/data/discord-integration";
import { isSafeHttpUrl } from "@/lib/validation/url";
import type { DiscordIntegrationInfo } from "@/lib/data/discord-integration";

export type DiscordIntegrationState = { error: string | null };

const DISCORD_WEBHOOK_HOST_SUFFIX = "discord.com";

/**
 * Loaded by the settings page itself (project-access is already checked by
 * the page's own requireProjectAccess before this is reached) - kept as a
 * plain read function rather than folding into page.tsx directly so the
 * Server Component and the Server Actions below share one data-layer call.
 */
export async function loadDiscordIntegrationInfo(projectId: string, userId: string): Promise<DiscordIntegrationInfo | null> {
  return getDiscordIntegrationInfo(projectId, userId);
}

/**
 * Accepts only a real Discord webhook URL - isSafeHttpUrl (already used by
 * decision/source link fields) rejects javascript:/data:/etc, and the host
 * check here additionally rejects a URL that would just have this app's own
 * server POST a task title to an arbitrary attacker-controlled endpoint
 * (SSRF via a "webhook" field is the same class of bug a redirect-URL
 * allowlist guards against elsewhere in this codebase).
 *
 * A bare `hostname.endsWith("discord.com")` would also accept
 * `evildiscord.com` - a different, attacker-registerable domain that merely
 * shares the suffix string, not a subdomain. Requiring an exact match or a
 * `.`-prefixed subdomain closes that.
 */
function isValidDiscordWebhookUrl(url: string): boolean {
  if (!isSafeHttpUrl(url)) return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      (parsed.hostname === DISCORD_WEBHOOK_HOST_SUFFIX || parsed.hostname.endsWith(`.${DISCORD_WEBHOOK_HOST_SUFFIX}`))
    );
  } catch {
    return false;
  }
}

export async function saveDiscordWebhook(projectId: string, webhookUrl: string): Promise<DiscordIntegrationState> {
  const access = await getProjectAccess(projectId);
  if (!access || !canManageProject(access.role)) {
    return { error: "You do not have permission to change this project's Discord integration." };
  }

  const trimmed = webhookUrl.trim();
  if (!isValidDiscordWebhookUrl(trimmed)) {
    return { error: "Enter a valid Discord webhook URL (https://discord.com/api/webhooks/...)." };
  }

  await saveDiscordWebhookUrl(projectId, access.userId, trimmed);
  revalidatePath(`/projects/${projectId}/settings`);
  return { error: null };
}

export async function removeDiscordWebhook(projectId: string): Promise<DiscordIntegrationState> {
  const access = await getProjectAccess(projectId);
  if (!access || !canManageProject(access.role)) {
    return { error: "You do not have permission to change this project's Discord integration." };
  }

  await clearDiscordWebhookUrl(projectId, access.userId);
  revalidatePath(`/projects/${projectId}/settings`);
  return { error: null };
}

/**
 * Removes the project's Discord server link (the `/guidon-link` one) and
 * keeps its notification webhook. Fails - rather than reporting success -
 * when nothing was disconnected (not linked, or RLS filtered the write for a
 * non-manager), see disconnectDiscordGuild.
 */
export async function disconnectDiscordServer(projectId: string): Promise<DiscordIntegrationState> {
  const access = await getProjectAccess(projectId);
  if (!access || !canManageProject(access.role)) {
    return { error: "You do not have permission to change this project's Discord integration." };
  }

  let result: Awaited<ReturnType<typeof disconnectDiscordGuild>>;
  try {
    result = await disconnectDiscordGuild(projectId, access.userId);
  } catch (error) {
    console.error("disconnectDiscordServer failed:", error);
    return { error: "Could not disconnect the Discord server. Please try again." };
  }
  if (!result.ok) return { error: result.error };

  revalidatePath(`/projects/${projectId}/settings`);
  return { error: null };
}
