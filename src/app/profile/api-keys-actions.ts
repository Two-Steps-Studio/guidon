"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/data/current-user";
import { dataClient } from "@/lib/data-client";
import { generateApiKey, hashApiKey, keyPrefix, API_KEY_SCOPES } from "@/lib/api/api-keys";
import { reportsScopeMixedWithOthers } from "@/lib/api/scopes";

export type ApiKeyRow = {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

const API_KEY_COLUMNS = "id, name, key_prefix, scopes, created_at, last_used_at, revoked_at";

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

async function mintApiKey(userId: string, name: string, scopes: string[]): Promise<CreateApiKeyState> {
  const fullKey = generateApiKey();
  const hash = hashApiKey(fullKey);
  const prefix = keyPrefix(fullKey);

  // Returned to the caller (not just revalidatePath'd) so the client
  // component can append the new key to its list immediately - it holds
  // `keys` in useState seeded from the initial server render, which
  // revalidatePath() alone doesn't update without a remount.
  const { data: row, error } = await dataClient(userId)
    .from("api_keys")
    .insert({ user_id: userId, name, key_prefix: prefix, key_hash: hash, scopes })
    .select<ApiKeyRow>(API_KEY_COLUMNS)
    .single();

  if (error || !row) return { error: error?.message ?? "Could not create the key.", fullKey: null, row: null };

  revalidatePath("/profile");
  return { error: null, fullKey, row };
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
