import "server-only";

import { randomUUID } from "node:crypto";
import { canManageOrg, getOrgAccess } from "@/lib/data/org-access";
import { dataClient, serviceDataClient } from "@/lib/data-client";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withServiceRole } from "@/lib/db/session";
import { createServiceClient } from "@/lib/supabase-server";
import { hostedMemberLimitError, hostedProjectMemberLimitError } from "@/lib/limits";
import { logActivity } from "@/lib/data/log-activity";
import { mintApiKey } from "@/lib/api/mint-api-key";
import type { ApiKeyScope } from "@/lib/api/scopes";
import { AI_ACCOUNT_EMAIL_DOMAIN } from "@/lib/ai-account-email";

/**
 * AI accounts (migration 059): member bots an organization's owner/admin
 * creates for an AI agent. Each one is a real user - so it can hold project
 * roles, be assigned tasks and sign its own comments - with no password and
 * an .invalid address, acting only through API/MCP keys.
 *
 * Everything that writes here uses the service role, after the app-level
 * check below (owner/admin of the organization, bot belongs to it). That is
 * deliberate, not a shortcut: ai_accounts has no write grant at all, because
 * marking an existing person's profile as an AI account would let an admin
 * mint a key that acts as that person. Only a user this module has just
 * created ever becomes one.
 */

export const AI_ACCOUNT_PROJECT_ROLES = ["developer", "tester", "viewer"] as const;
export type AiAccountProjectRole = (typeof AI_ACCOUNT_PROJECT_ROLES)[number];

/** What an agent needs; reports:write is for keys shipped inside games and stays out. */
const AGENT_SCOPES: ApiKeyScope[] = ["tasks:read", "tasks:write", "tasks:status", "comments:write", "attempts:write"];

export interface AiAccountKey {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
}

export interface AiAccount {
  userId: string;
  name: string;
  description: string | null;
  createdBy: string | null;
  createdAt: string;
  disabledAt: string | null;
  projects: { id: string; name: string; role: string }[];
  keys: AiAccountKey[];
}

type Result<T = null> = { error: string | null; data: T | null };

async function requireManager(orgId: string) {
  const access = await getOrgAccess(orgId);
  if (!access || !canManageOrg(access.role)) return null;
  return access;
}

/** The bot, if it is an AI account of this organization (and still active when `active`). */
async function findAccount(orgId: string, userId: string, active: boolean) {
  const { data } = await serviceDataClient()
    .from<{ user_id: string; disabled_at: string | null }>("ai_accounts")
    .select("user_id, disabled_at")
    .eq("user_id", userId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!data || (active && data.disabled_at)) return null;
  return data;
}

/** A user who can't sign in: no password, and an address no mail can reach (RFC 2606 .invalid). */
async function createAgentUser(name: string): Promise<string> {
  const email = `ai-${randomUUID()}@${AI_ACCOUNT_EMAIL_DOMAIN}`;
  const metadata = { full_name: name, guidon_ai_account: true };
  if (hasDirectDatabase()) {
    return withServiceRole(async ({ query }) => {
      const result = await query(
        `INSERT INTO auth.users (email, encrypted_password, email_confirmed_at, raw_user_meta_data)
         VALUES ($1, NULL, now(), $2::jsonb) RETURNING id`,
        [email, JSON.stringify(metadata)]
      );
      return result.rows[0].id as string;
    });
  }
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (error || !data.user) throw new Error(error?.message ?? "Could not create the AI account.");
  return data.user.id;
}

/** Undo a half-made account. Safe only because the user is brand new - it has no history to lose. */
async function deleteAgentUser(userId: string): Promise<void> {
  if (hasDirectDatabase()) {
    await withServiceRole(({ query }) => query("DELETE FROM auth.users WHERE id = $1", [userId]));
    return;
  }
  await createServiceClient().auth.admin.deleteUser(userId);
}

export async function createAiAccount(
  orgId: string,
  input: { name: string; description: string; projects: { projectId: string; role: string }[] }
): Promise<Result<{ userId: string }>> {
  const access = await requireManager(orgId);
  if (!access) return { error: "Only the organization's owner or admins can create AI accounts.", data: null };

  const name = input.name.trim();
  const description = input.description.trim();
  if (!name || name.length > 80) return { error: "Give the AI account a name (up to 80 characters).", data: null };
  if (description.length > 500) return { error: "The description can be up to 500 characters.", data: null };
  if (input.projects.some((p) => !(AI_ACCOUNT_PROJECT_ROLES as readonly string[]).includes(p.role))) {
    return { error: "AI accounts can be developers, testers or viewers.", data: null };
  }

  // Only this organization's projects (checked with the caller's own RLS view).
  const projectIds = [...new Set(input.projects.map((p) => p.projectId))];
  if (projectIds.length) {
    const { data: projects } = await dataClient(access.userId)
      .from<{ id: string }>("projects")
      .select("id")
      .eq("organization_id", orgId)
      .in("id", projectIds);
    if ((projects ?? []).length !== projectIds.length) return { error: "Unknown project.", data: null };
  }

  // An AI account takes a seat like any member - otherwise bots would bypass the plan's limit.
  const seatsError = await hostedMemberLimitError(orgId);
  if (seatsError) return { error: seatsError, data: null };
  for (const projectId of projectIds) {
    const limitError = await hostedProjectMemberLimitError(projectId, orgId);
    if (limitError) return { error: limitError, data: null };
  }

  let userId: string;
  try {
    userId = await createAgentUser(name);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not create the AI account.", data: null };
  }

  const service = serviceDataClient();
  const steps = [
    () => service.from("ai_accounts").insert({ user_id: userId, organization_id: orgId, created_by: access.userId, description: description || null }).select("user_id").single(),
    () => service.from("organization_members").insert({ organization_id: orgId, user_id: userId, role: "member" }).select("id").single(),
    ...input.projects.map(
      (p) => () => service.from("project_members").insert({ project_id: p.projectId, user_id: userId, role: p.role }).select("id").single()
    ),
  ];
  for (const step of steps) {
    const { error } = await step();
    if (error) {
      await deleteAgentUser(userId).catch(() => {});
      return { error: error.message, data: null };
    }
  }

  await logActivity({
    userId: access.userId,
    action: "ai_account_created",
    organizationId: orgId,
    entityType: "ai_account",
    entityId: userId,
    details: { name, projects: projectIds.length },
  });
  return { error: null, data: { userId } };
}

export async function listAiAccounts(orgId: string): Promise<Result<AiAccount[]>> {
  const access = await requireManager(orgId);
  if (!access) return { error: "Only the organization's owner or admins can manage AI accounts.", data: null };

  const service = serviceDataClient();
  const { data: rows, error } = await service
    .from<{ user_id: string; description: string | null; created_by: string | null; created_at: string; disabled_at: string | null }>("ai_accounts")
    .select("user_id, description, created_by, created_at, disabled_at")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: true });
  if (error) return { error: error.message, data: null };
  const ids = (rows ?? []).map((row) => row.user_id);
  if (!ids.length) return { error: null, data: [] };

  const [profiles, memberships, keys] = await Promise.all([
    service.from<{ id: string; full_name: string | null }>("profiles").select("id, full_name").in("id", ids),
    service.from<{ user_id: string; role: string; project_id: string }>("project_members").select("user_id, role, project_id").in("user_id", ids),
    service
      .from<AiAccountKey & { user_id: string }>("api_keys")
      .select("id, user_id, name, key_prefix, created_at, last_used_at")
      .in("user_id", ids)
      .is("revoked_at", null)
      .order("created_at", { ascending: true }),
  ]);
  const projectIds = [...new Set((memberships.data ?? []).map((m) => m.project_id))];
  const { data: projects } = projectIds.length
    ? await service.from<{ id: string; name: string }>("projects").select("id, name").in("id", projectIds)
    : { data: [] };
  const projectName = new Map((projects ?? []).map((p) => [p.id, p.name]));
  const fullName = new Map((profiles.data ?? []).map((p) => [p.id, p.full_name]));

  return {
    error: null,
    data: (rows ?? []).map((row) => ({
      userId: row.user_id,
      name: fullName.get(row.user_id) || "AI",
      description: row.description,
      createdBy: row.created_by,
      createdAt: String(row.created_at),
      disabledAt: row.disabled_at ? String(row.disabled_at) : null,
      projects: (memberships.data ?? [])
        .filter((m) => m.user_id === row.user_id)
        .map((m) => ({ id: m.project_id, name: projectName.get(m.project_id) ?? "", role: m.role })),
      keys: (keys.data ?? [])
        .filter((k) => k.user_id === row.user_id)
        .map(({ id, name, key_prefix, created_at, last_used_at }) => ({ id, name, key_prefix, created_at, last_used_at })),
    })),
  };
}

export async function createAiAccountKey(orgId: string, userId: string, name: string): Promise<Result<{ fullKey: string }>> {
  const access = await requireManager(orgId);
  if (!access) return { error: "Only the organization's owner or admins can manage AI accounts.", data: null };
  if (!(await findAccount(orgId, userId, true))) return { error: "AI account not found.", data: null };

  const keyName = name.trim().slice(0, 80) || "Agent key";
  const minted = await mintApiKey(serviceDataClient(), userId, keyName, AGENT_SCOPES);
  if (minted.error || !minted.fullKey) return { error: minted.error ?? "Could not create the key.", data: null };
  return { error: null, data: { fullKey: minted.fullKey } };
}

export async function revokeAiAccountKey(orgId: string, userId: string, keyId: string): Promise<Result> {
  const access = await requireManager(orgId);
  if (!access) return { error: "Only the organization's owner or admins can manage AI accounts.", data: null };
  if (!(await findAccount(orgId, userId, false))) return { error: "AI account not found.", data: null };

  const { data, error } = await serviceDataClient()
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", keyId)
    .eq("user_id", userId)
    .is("revoked_at", null)
    .select("id");
  if (error) return { error: error.message, data: null };
  if (!data?.length) return { error: "Key not found.", data: null };
  return { error: null, data: null };
}

/**
 * Switch an AI account off: keys revoked, memberships removed, profile kept
 * so its comments and activity still carry its name (see migration 059).
 */
export async function disableAiAccount(orgId: string, userId: string): Promise<Result> {
  const access = await requireManager(orgId);
  if (!access) return { error: "Only the organization's owner or admins can manage AI accounts.", data: null };
  if (!(await findAccount(orgId, userId, true))) return { error: "AI account not found.", data: null };

  const service = serviceDataClient();
  const now = new Date().toISOString();
  for (const step of [
    () => service.from("api_keys").update({ revoked_at: now }).eq("user_id", userId).is("revoked_at", null).select("id"),
    () => service.from("project_members").delete().eq("user_id", userId).select("id"),
    () => service.from("organization_members").delete().eq("user_id", userId).eq("organization_id", orgId).select("id"),
    () => service.from("ai_accounts").update({ disabled_at: now }).eq("user_id", userId).select("user_id"),
  ]) {
    const { error } = await step();
    if (error) return { error: error.message, data: null };
  }

  await logActivity({
    userId: access.userId,
    action: "ai_account_disabled",
    organizationId: orgId,
    entityType: "ai_account",
    entityId: userId,
  });
  return { error: null, data: null };
}

/** Which of these users are AI accounts - for "AI" badges in member lists and pickers. */
export async function aiAccountIds(viewerId: string, userIds: string[]): Promise<Set<string>> {
  if (!userIds.length) return new Set();
  const { data } = await dataClient(viewerId).from<{ user_id: string }>("ai_accounts").select("user_id").in("user_id", userIds);
  return new Set((data ?? []).map((row) => row.user_id));
}
