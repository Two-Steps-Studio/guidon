import "server-only";

import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { createClient } from "@/lib/supabase-server";
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
  if (hasDirectDatabase()) {
    const result = await withUser(userId, ({ query }) =>
      query(`SELECT ${SAFE_COLUMNS} FROM organization_ai_settings WHERE organization_id = $1`, [
        organizationId,
      ])
    );
    return result.rows[0] ?? null;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_ai_settings")
    .select(SAFE_COLUMNS)
    .eq("organization_id", organizationId)
    .maybeSingle();

  // error and "no row" both used to collapse to null here, which let a
  // transient query failure look identical to "org has no AI settings" -
  // resolveAIProvider() would then silently fall through to the
  // instance-wide env provider instead of surfacing the real problem.
  if (error) throw new Error(`Failed to load AI settings: ${error.message}`);
  return (data as OrgAiSettingsSafe | null) ?? null;
}

export interface OrgAiSettingsWithKey extends OrgAiSettingsSafe {
  apiKey: string;
}

/**
 * Full config incl. the decrypted key. Server-only, and only ever called
 * from resolve-provider.ts right before constructing a live AI provider -
 * never returned toward a client component.
 */
export async function getOrgAiSettingsWithKey(
  organizationId: string,
  userId: string
): Promise<OrgAiSettingsWithKey | null> {
  // api_key_encrypted is no longer directly SELECT-able by `authenticated`
  // (025) - private.get_org_ai_settings_with_key() is a SECURITY DEFINER
  // function that re-checks org membership itself and returns it, closing
  // the direct-PostgREST-query path a plain column GRANT can't distinguish
  // "the app needs this server-side" from "any member can fetch this
  // ciphertext directly."
  let row: { provider: OrgAiProviderName; model: string; api_key_encrypted: string } | null = null;

  if (hasDirectDatabase()) {
    const result = await withUser(userId, ({ query }) =>
      query("SELECT * FROM private.get_org_ai_settings_with_key($1)", [organizationId])
    );
    row = result.rows[0] ?? null;
  } else {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_org_ai_settings_with_key", {
      p_organization_id: organizationId,
    });
    // Same reasoning as getOrgAiSettingsSafe above: a real error must not
    // be treated as "not configured," or resolveAIProvider() silently
    // reroutes the request to a different provider/key than the org chose.
    if (error) throw new Error(`Failed to load AI settings: ${error.message}`);
    row = data?.[0] ?? null;
  }

  if (!row) return null;

  return {
    provider: row.provider,
    model: row.model,
    apiKey: decryptSecret(row.api_key_encrypted, AI_KEY_INFO),
  };
}

export interface UpsertOrgAiSettingsInput {
  organizationId: string;
  createdBy: string;
  provider: OrgAiProviderName;
  model: string;
  apiKey: string;
}

/** Sets (or replaces) the org's AI provider/model/key. */
export async function upsertOrgAiSettings(input: UpsertOrgAiSettingsInput): Promise<void> {
  const encryptedKey = encryptSecret(input.apiKey, AI_KEY_INFO);

  if (hasDirectDatabase()) {
    await withUser(input.createdBy, ({ query }) =>
      query(
        `INSERT INTO organization_ai_settings (organization_id, provider, model, api_key_encrypted, created_by, updated_at)
         VALUES ($1, $2, $3, $4, $5, now())
         ON CONFLICT (organization_id) DO UPDATE SET
           provider = EXCLUDED.provider,
           model = EXCLUDED.model,
           api_key_encrypted = EXCLUDED.api_key_encrypted,
           updated_at = now()`,
        [input.organizationId, input.provider, input.model, encryptedKey, input.createdBy]
      )
    );
    return;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("organization_ai_settings").upsert(
    {
      organization_id: input.organizationId,
      provider: input.provider,
      model: input.model,
      api_key_encrypted: encryptedKey,
      created_by: input.createdBy,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id" }
  );

  if (error) throw new Error(`Failed to save AI settings: ${error.message}`);
}

/** Removes the org's AI settings - it then falls back to the instance-wide env provider, if any. */
export async function deleteOrgAiSettings(organizationId: string, userId: string): Promise<void> {
  if (hasDirectDatabase()) {
    await withUser(userId, ({ query }) =>
      query("DELETE FROM organization_ai_settings WHERE organization_id = $1", [organizationId])
    );
    return;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("organization_ai_settings")
    .delete()
    .eq("organization_id", organizationId);

  if (error) throw new Error(`Failed to remove AI settings: ${error.message}`);
}
