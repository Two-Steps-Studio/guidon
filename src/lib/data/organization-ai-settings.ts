import "server-only";

import { dataClient } from "@/lib/data-client";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secret-box";
import type { OrgAiProviderName } from "@/lib/ai/org-ai-providers";

export type { OrgAiProviderName } from "@/lib/ai/org-ai-providers";

const AI_KEY_INFO = "org-ai-key-v1";

/** Safe subset - no key. Fine to pass to a client component. */
export interface OrgAiSettingsSafe {
  provider: OrgAiProviderName;
  model: string;
}

const SAFE_COLUMNS = "provider, model";

/**
 * The org's AI provider/model, if configured - never includes the key.
 * Used to render the settings page and to gate the "AI available" checks
 * in resolve-provider.ts without ever decrypting anything.
 */
export async function getOrgAiSettingsSafe(
  organizationId: string,
  userId: string
): Promise<OrgAiSettingsSafe | null> {
  const { data, error } = await dataClient(userId)
    .from<OrgAiSettingsSafe>("organization_ai_settings")
    .select(SAFE_COLUMNS)
    .eq("organization_id", organizationId)
    .maybeSingle();
  // An error must not look like "no AI settings": resolveAIProvider() would
  // then silently fall through to the instance-wide env provider.
  if (error) throw new Error(`Failed to load AI settings: ${error.message}`);
  return data;
}

export interface OrgAiSettingsWithKey extends OrgAiSettingsSafe {
  apiKey: string;
}

/**
 * Full config incl. the decrypted key. Server-only, and only ever called
 * from resolve-provider.ts right before constructing a live AI provider -
 * never returned toward a client component.
 *
 * api_key_encrypted isn't SELECT-able by `authenticated` (025); the
 * SECURITY DEFINER get_org_ai_settings_with_key() re-checks org membership
 * and returns it (public wrapper from 030, so both modes call the same name).
 */
export async function getOrgAiSettingsWithKey(
  organizationId: string,
  userId: string
): Promise<OrgAiSettingsWithKey | null> {
  const { data, error } = await dataClient(userId).rpcRows<{
    provider: OrgAiProviderName;
    model: string;
    api_key_encrypted: string;
  }>("get_org_ai_settings_with_key", { p_organization_id: organizationId });
  // Same reasoning as getOrgAiSettingsSafe: a real error isn't "not configured".
  if (error) throw new Error(`Failed to load AI settings: ${error.message}`);
  const row = data[0];
  if (!row) return null;
  return { provider: row.provider, model: row.model, apiKey: decryptSecret(row.api_key_encrypted, AI_KEY_INFO) };
}

export interface UpsertOrgAiSettingsInput {
  organizationId: string;
  createdBy: string;
  provider: OrgAiProviderName;
  model: string;
  apiKey: string;
}

/**
 * Sets (or replaces) the org's AI provider/model/key. upsertRow, not an
 * upsert: `ON CONFLICT DO UPDATE SET api_key_encrypted = EXCLUDED...` needs
 * a SELECT grant that column deliberately doesn't have (025), so every save
 * used to fail with "permission denied" - see upsertRow's comment.
 */
export async function upsertOrgAiSettings(input: UpsertOrgAiSettingsInput): Promise<void> {
  const { error } = await dataClient(input.createdBy).upsertRow("organization_ai_settings", {
    key: { organization_id: input.organizationId },
    set: {
      provider: input.provider,
      model: input.model,
      api_key_encrypted: encryptSecret(input.apiKey, AI_KEY_INFO),
      updated_at: new Date().toISOString(),
    },
    insertOnly: { created_by: input.createdBy },
  });
  if (error) throw new Error(`Failed to save AI settings: ${error.message}`);
}

/** Removes the org's AI settings - it then falls back to the instance-wide env provider, if any. */
export async function deleteOrgAiSettings(organizationId: string, userId: string): Promise<void> {
  const { error } = await dataClient(userId)
    .from("organization_ai_settings")
    .delete()
    .eq("organization_id", organizationId);
  if (error) throw new Error(`Failed to remove AI settings: ${error.message}`);
}
