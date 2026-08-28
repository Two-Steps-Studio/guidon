"use server";

import { revalidatePath } from "next/cache";
import { canManageOrg, getOrgAccess } from "@/lib/data/org-access";
import { deleteOrgAiSettings, upsertOrgAiSettings } from "@/lib/data/organization-ai-settings";
import { ORG_AI_PROVIDER_NAMES, type OrgAiProviderName } from "@/lib/ai/org-ai-providers";

// `saved` distinguishes "just succeeded" from the initial `{error: null}`
// state, so the form knows to collapse back to the summary view only after
// a real submission - not on first render.
export type AiSettingsState = { error: string | null; saved: boolean };

function isOrgAiProviderName(value: unknown): value is OrgAiProviderName {
  return typeof value === "string" && (ORG_AI_PROVIDER_NAMES as readonly string[]).includes(value);
}

/**
 * Saves the organization's AI provider/model/key. The key field is
 * optional on this form once a config already exists ("leave blank to
 * keep the current key") - an empty key is only rejected when there is no
 * existing row to fall back to.
 */
export async function saveOrgAiSettings(
  organizationId: string,
  _prevState: AiSettingsState,
  formData: FormData
): Promise<AiSettingsState> {
  const access = await getOrgAccess(organizationId);
  // Mirrors organization_ai_settings_insert/update (024): owner/admin only.
  if (!access || !canManageOrg(access.role)) {
    return {
      error: "You do not have permission to change AI settings for this organization.",
      saved: false,
    };
  }

  const provider = formData.get("provider");
  const model = formData.get("model");
  const apiKey = formData.get("api_key");
  const hadExistingKey = formData.get("had_existing_key") === "true";

  if (!isOrgAiProviderName(provider)) {
    return { error: "Choose a provider.", saved: false };
  }
  if (typeof model !== "string" || !model.trim()) {
    return { error: "Model is required.", saved: false };
  }
  if (typeof apiKey !== "string") {
    return { error: "Invalid API key.", saved: false };
  }

  const trimmedKey = apiKey.trim();
  if (!trimmedKey && !hadExistingKey) {
    return { error: "API key is required.", saved: false };
  }

  try {
    if (trimmedKey) {
      await upsertOrgAiSettings({
        organizationId,
        createdBy: access.userId,
        provider,
        model: model.trim(),
        apiKey: trimmedKey,
      });
    } else {
      // Blank key on an existing config: keep the stored key, just update
      // provider/model. upsertOrgAiSettings always writes a key, so this
      // re-reads the current one rather than re-encrypting a blank string.
      const { getOrgAiSettingsWithKey } = await import("@/lib/data/organization-ai-settings");
      const current = await getOrgAiSettingsWithKey(organizationId, access.userId);
      if (!current) {
        return { error: "API key is required.", saved: false };
      }
      await upsertOrgAiSettings({
        organizationId,
        createdBy: access.userId,
        provider,
        model: model.trim(),
        apiKey: current.apiKey,
      });
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to save AI settings.",
      saved: false,
    };
  }

  revalidatePath(`/organizations/${organizationId}/settings`);
  return { error: null, saved: true };
}

export async function removeOrgAiSettings(organizationId: string): Promise<{ error: string | null }> {
  const access = await getOrgAccess(organizationId);
  // Mirrors organization_ai_settings_delete (024): owner/admin only.
  if (!access || !canManageOrg(access.role)) {
    return { error: "You do not have permission to change AI settings for this organization." };
  }

  try {
    await deleteOrgAiSettings(organizationId, access.userId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to remove AI settings." };
  }

  revalidatePath(`/organizations/${organizationId}/settings`);
  return { error: null };
}
