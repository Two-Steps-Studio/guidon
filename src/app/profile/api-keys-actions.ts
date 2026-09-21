"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/data/current-user";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { generateApiKey, hashApiKey, keyPrefix, API_KEY_SCOPES } from "@/lib/api/api-keys";

export type ApiKeyRow = {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

export async function listApiKeys(): Promise<ApiKeyRow[]> {
  const user = await getCurrentUser();

  if (hasDirectDatabase()) {
    const result = await withUser(user.id, ({ query }) =>
      query(
        "SELECT id, name, key_prefix, scopes, created_at, last_used_at, revoked_at FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC",
        [user.id]
      )
    );
    return result.rows;
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("api_keys")
    .select("id, name, key_prefix, scopes, created_at, last_used_at, revoked_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (data ?? []) as ApiKeyRow[];
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
  let row: ApiKeyRow;

  if (hasDirectDatabase()) {
    const result = await withUser(userId, ({ query }) =>
      query(
        `INSERT INTO api_keys (user_id, name, key_prefix, key_hash, scopes)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, key_prefix, scopes, created_at, last_used_at, revoked_at`,
        [userId, name, prefix, hash, scopes]
      )
    );
    row = result.rows[0] as ApiKeyRow;
  } else {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("api_keys")
      .insert({ user_id: userId, name, key_prefix: prefix, key_hash: hash, scopes })
      .select("id, name, key_prefix, scopes, created_at, last_used_at, revoked_at")
      .single();

    if (error) return { error: error.message, fullKey: null, row: null };
    row = data as ApiKeyRow;
  }

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

  if (hasDirectDatabase()) {
    await withUser(user.id, ({ query }) =>
      query("UPDATE api_keys SET revoked_at = now() WHERE id = $1 AND user_id = $2", [keyId, user.id])
    );
  } else {
    const supabase = await createClient();
    const { error } = await supabase
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", keyId)
      .eq("user_id", user.id);

    if (error) return { error: error.message };
  }

  revalidatePath("/profile");
  return { error: null };
}
