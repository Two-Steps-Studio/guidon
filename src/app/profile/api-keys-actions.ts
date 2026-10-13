"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/data/current-user";
import { dataClient } from "@/lib/data-client";
import { API_KEY_SCOPES } from "@/lib/api/api-keys";
import { API_KEY_COLUMNS, mintApiKey as mintApiKeyRow, type MintedApiKeyRow } from "@/lib/api/mint-api-key";
import { reportsScopeMixedWithOthers } from "@/lib/api/scopes";
import { canWriteProject, getProjectAccess } from "@/lib/data/project-access";
import { parseAllowedOrigins } from "@/lib/api/key-origins";

export type ApiKeyRow = MintedApiKeyRow;

export async function listApiKeys(): Promise<ApiKeyRow[]> {
  const user = await getCurrentUser();

  const { data } = await dataClient(user.id)
    .from<ApiKeyRow>("api_keys")
    .select(API_KEY_COLUMNS)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return data;
}

export type CreateApiKeyState = { error: string | null; fullKey: string | null; row: ApiKeyRow | null };

async function mintApiKey(
  userId: string,
  name: string,
  scopes: string[],
  binding: { projectId: string; allowedOrigins: string[] | null } | null = null
): Promise<CreateApiKeyState> {
  const result = await mintApiKeyRow(dataClient(userId), userId, name, scopes, binding);
  // The row is returned to the caller (not just revalidatePath'd) so the
  // client component can append the new key to its list immediately - it
  // holds `keys` in useState seeded from the initial server render, which
  // revalidatePath() alone doesn't update without a remount.
  if (!result.error) revalidatePath("/profile");
  return result;
}

export async function createApiKey(
  _prevState: CreateApiKeyState,
  formData: FormData
): Promise<CreateApiKeyState> {
  const user = await getCurrentUser();

  const name = formData.get("name");
  if (typeof name !== "string" || !name.trim()) {
    return { error: "Name is required.", fullKey: null, row: null };
  }

  const selectedScopes = API_KEY_SCOPES.filter((scope) => formData.get(`scope:${scope}`) === "on");
  if (selectedScopes.length === 0) {
    return { error: "Select at least one scope.", fullKey: null, row: null };
  }
  if (reportsScopeMixedWithOthers(selectedScopes)) {
    return {
      error: "reports:write can't be combined with other scopes - that key ships inside your game. Create a separate key for it.",
      fullKey: null,
      row: null,
    };
  }

  return mintApiKey(user.id, name.trim(), selectedScopes);
}

// Everything the MCP endpoint's tools can call (src/lib/mcp/http/tools.ts) -
// the Profile "Connect Claude Code" card creates a key with exactly this set
// so nobody has to know which scopes the tools need.
const CLAUDE_CODE_MCP_SCOPES = ["tasks:read", "tasks:write", "tasks:status", "comments:write", "attempts:write"];

export async function createClaudeCodeConnectionKey(): Promise<{ error: string | null; fullKey: string | null }> {
  const user = await getCurrentUser();
  const date = new Date().toISOString().slice(0, 10);

  try {
    const result = await mintApiKey(user.id, `Claude Code (MCP) ${date}`, CLAUDE_CODE_MCP_SCOPES);
    return { error: result.error, fullKey: result.fullKey };
  } catch (error) {
    console.error("Failed to create the Claude Code connection key:", error);
    return { error: "Could not create the key. Try again.", fullKey: null };
  }
}

export async function revokeApiKey(keyId: string): Promise<{ error: string | null }> {
  const user = await getCurrentUser();

  const { data: updatedRows, error } = await dataClient(user.id)
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", keyId)
    .eq("user_id", user.id)
    .select("id");

  if (error) return { error: error.message };
  if (updatedRows.length === 0) {
    return { error: "This key no longer exists, or it isn't yours to revoke." };
  }

  revalidatePath("/profile");
  return { error: null };
}

/**
 * Key for the web bug-report widget (public/widget/report.js), created from
 * the project's settings. reports:write only, bound to this project and
 * optionally to the sites it's installed on (migration 054): the key sits in
 * a public web page, so a copied key can file reports into this project from
 * these sites and do nothing else. Filing still runs as this user under RLS
 * (tasks_insert: owner/admin/developer), the same gate as the check below.
 */
export async function createReportWidgetKey(
  projectId: string,
  originsInput: string
): Promise<{ error: string | null; fullKey: string | null; row: ApiKeyRow | null }> {
  const access = await getProjectAccess(projectId);
  if (!access || !canWriteProject(access.role)) {
    return { error: "You need to be able to create tasks in this project to set up the widget.", fullKey: null, row: null };
  }
  const origins = parseAllowedOrigins(originsInput);
  if (!origins.ok) return { error: origins.error, fullKey: null, row: null };

  const date = new Date().toISOString().slice(0, 10);
  try {
    return await mintApiKey(access.userId, `Web bug reports - ${access.project.name} ${date}`, ["reports:write"], {
      projectId,
      allowedOrigins: origins.value.length > 0 ? origins.value : null,
    });
  } catch (error) {
    console.error("Failed to create the report widget key:", error);
    return { error: "Could not create the key. Try again.", fullKey: null, row: null };
  }
}

/** The caller's own active widget keys for this project (RLS: api_keys_select is own rows only). */
export async function listReportWidgetKeys(projectId: string): Promise<ApiKeyRow[]> {
  const user = await getCurrentUser();
  const { data } = await dataClient(user.id)
    .from<ApiKeyRow>("api_keys")
    .select(API_KEY_COLUMNS)
    .eq("user_id", user.id)
    .eq("project_id", projectId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  return data ?? [];
}
