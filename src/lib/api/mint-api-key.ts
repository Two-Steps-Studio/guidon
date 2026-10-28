import "server-only";

import type { DataClient } from "@/lib/data-client";
import { generateApiKey, hashApiKey, keyPrefix } from "./api-keys";

export type MintedApiKeyRow = {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  /** Migration 054 - set for keys bound to one project (report keys). */
  project_id: string | null;
  allowed_origins: string[] | null;
  /** Migration 073; personal keys may set it since 101. Null = never expires. */
  expires_at: string | null;
};

export const API_KEY_COLUMNS =
  "id, name, key_prefix, scopes, created_at, last_used_at, revoked_at, project_id, allowed_origins, expires_at";

/**
 * Inserts a new API key for `userId` through `client` (RLS: api_keys_insert -
 * own rows only, and a project binding needs owner/admin/developer there)
 * and returns the full key once, with its row. Shared by the profile/
 * settings Server Actions and the plugins' report-key route, so a key minted
 * from either place has the same shape.
 */
export async function mintApiKey(
  client: DataClient,
  userId: string,
  name: string,
  scopes: string[],
  binding: { projectId: string; allowedOrigins: string[] | null } | null = null,
  expiresAt: Date | null = null
): Promise<{ error: string | null; fullKey: string | null; row: MintedApiKeyRow | null }> {
  const fullKey = generateApiKey();

  const { data: row, error } = await client
    .from("api_keys")
    .insert({
      user_id: userId,
      name,
      key_prefix: keyPrefix(fullKey),
      key_hash: hashApiKey(fullKey),
      scopes,
      ...(binding ? { project_id: binding.projectId, allowed_origins: binding.allowedOrigins } : {}),
      ...(expiresAt ? { expires_at: expiresAt.toISOString() } : {}),
    })
    .select<MintedApiKeyRow>(API_KEY_COLUMNS)
    .single();

  if (error || !row) return { error: error?.message ?? "Could not create the key.", fullKey: null, row: null };
  return { error: null, fullKey, row };
}
