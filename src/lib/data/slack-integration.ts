import "server-only";

import { dataClient, serviceDataClient } from "@/lib/data-client";
import { PROJECT_LIST_SAFETY_CAP } from "@/lib/limits";
import type { SlackChannelRef } from "@/lib/slack/link-token";

export interface SlackChannelLink {
  id: string;
  projectId: string;
  teamId: string;
  teamName: string | null;
  channelId: string;
  channelName: string | null;
  linkedBy: string | null;
  createdAt: string;
}

type Row = {
  id: string;
  project_id: string;
  team_id: string;
  team_name: string | null;
  channel_id: string;
  channel_name: string | null;
  linked_by: string | null;
  created_at: string;
};

const COLUMNS = "id, project_id, team_id, team_name, channel_id, channel_name, linked_by, created_at";

function toLink(row: Row): SlackChannelLink {
  return {
    id: row.id,
    projectId: row.project_id,
    teamId: row.team_id,
    teamName: row.team_name,
    channelId: row.channel_id,
    channelName: row.channel_name,
    linkedBy: row.linked_by,
    createdAt: row.created_at,
  };
}

/**
 * The project a Slack channel is connected to, for the command route.
 * Service role on purpose: the request comes from Slack, which carries no
 * Guidon session - the route has already verified Slack's signature, and
 * everything the command then does runs as `linkedBy` under RLS. This read
 * only answers "which project, as whom".
 */
export async function findSlackChannelLink(teamId: string, channelId: string): Promise<SlackChannelLink | null> {
  const { data, error } = await serviceDataClient()
    .from<Row>("slack_integrations")
    .select(COLUMNS)
    .eq("team_id", teamId)
    .eq("channel_id", channelId)
    .maybeSingle();
  if (error) throw new Error(`Failed to read the Slack link: ${error.message}`);
  return data ? toLink(data) : null;
}

/** Channels connected to a project (settings page) - RLS: any project member. */
export async function listSlackChannelLinks(projectId: string, userId: string): Promise<SlackChannelLink[]> {
  const { data, error } = await dataClient(userId)
    .from<Row>("slack_integrations")
    .select(COLUMNS)
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Failed to list Slack channels: ${error.message}`);
  return data.map(toLink);
}

export const SLACK_CHANNEL_LINKED_ELSEWHERE_ERROR =
  "This Slack channel is connected to a project you don't manage. Ask an admin of that project to disconnect it first.";

export type LinkSlackChannelResult = { ok: true; moved: boolean } | { ok: false; error: string };

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "23505";
}

/**
 * Connects a channel to a project as `userId` (the /slack/link confirmation).
 * A channel connected to another project is moved only if `userId` may
 * manage that one too: the DELETE runs under their RLS, so for anyone else it
 * removes nothing and the INSERT then hits the (team_id, channel_id) unique
 * constraint - reported as SLACK_CHANNEL_LINKED_ELSEWHERE_ERROR. Two
 * statements, not one transaction: if the INSERT fails after a move's
 * DELETE, the channel ends up disconnected rather than half-linked, and the
 * error says to try again. The caller checks `userId` can manage
 * `projectId`; RLS re-enforces it (and that linked_by is the caller).
 */
export async function linkSlackChannel(
  projectId: string,
  userId: string,
  channel: SlackChannelRef
): Promise<LinkSlackChannelResult> {
  const db = dataClient(userId);

  const { data: existing } = await db
    .from<Row>("slack_integrations")
    .select(COLUMNS)
    .eq("team_id", channel.teamId)
    .eq("channel_id", channel.channelId)
    .maybeSingle();
  if (existing?.project_id === projectId) return { ok: true, moved: false };

  let moved = false;
  if (existing) {
    const { data: removed, error } = await db
      .from("slack_integrations")
      .delete()
      .eq("id", existing.id)
      .eq("project_id", existing.project_id)
      .select("id");
    if (error || removed.length === 0) return { ok: false, error: SLACK_CHANNEL_LINKED_ELSEWHERE_ERROR };
    moved = true;
  }

  const { error } = await db.from("slack_integrations").insert({
    project_id: projectId,
    team_id: channel.teamId,
    team_name: channel.teamName,
    channel_id: channel.channelId,
    channel_name: channel.channelName,
    linked_by: userId,
  });
  if (error) {
    if (isUniqueViolation(error)) return { ok: false, error: SLACK_CHANNEL_LINKED_ELSEWHERE_ERROR };
    console.error("linkSlackChannel insert failed:", error);
    return { ok: false, error: moved ? "The channel was disconnected from its old project but couldn't be connected here. Try again." : "Could not connect the channel. Try again." };
  }
  return { ok: true, moved };
}

/** Disconnects one channel - scoped by id AND project, with a row count check (owner/admin under RLS). */
export async function unlinkSlackChannel(linkId: string, projectId: string, userId: string): Promise<boolean> {
  const { data, error } = await dataClient(userId)
    .from("slack_integrations")
    .delete()
    .eq("id", linkId)
    .eq("project_id", projectId)
    .select("id");
  if (error) throw new Error(`Failed to disconnect the Slack channel: ${error.message}`);
  return data.length > 0;
}

export interface SlackLinkableProject {
  id: string;
  name: string;
  organizationName: string;
}

/** Projects `userId` may connect a channel to (owner/admin), grouped by organization then name. */
export async function listSlackLinkableProjects(userId: string): Promise<SlackLinkableProject[]> {
  const db = dataClient(userId);
  const { data: memberships, error } = await db
    .from<{ project_id: string }>("project_members")
    .select("project_id")
    .eq("user_id", userId)
    .in("role", ["owner", "admin"])
    .limit(PROJECT_LIST_SAFETY_CAP);
  if (error) throw new Error(`Failed to list projects: ${error.message}`);
  const projectIds = memberships.map((m) => m.project_id);
  if (projectIds.length === 0) return [];

  const { data: projects } = await db
    .from<{ id: string; name: string; organization_id: string }>("projects")
    .select("id, name, organization_id")
    .in("id", projectIds);
  const { data: organizations } = await db
    .from<{ id: string; name: string }>("organizations")
    .select("id, name")
    .in("id", [...new Set(projects.map((p) => p.organization_id))]);
  const orgName = new Map(organizations.map((o) => [o.id, o.name]));

  return projects
    .map((p) => ({ id: p.id, name: p.name, organizationName: orgName.get(p.organization_id) ?? "" }))
    .sort((a, b) => a.organizationName.localeCompare(b.organizationName) || a.name.localeCompare(b.name));
}
