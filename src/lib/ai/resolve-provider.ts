import "server-only";

import { activeAIProviderName, getAIProvider, type AIProvider } from "@/lib/ai/provider";
import {
  getOrgAiSettingsSafe,
  getOrgAiSettingsWithKey,
  type OrgAiSettingsWithKey,
} from "@/lib/data/organization-ai-settings";

/**
 * Org-aware front door for the AI provider, sitting in front of
 * src/lib/ai/provider.ts rather than changing it. That module stays the
 * instance-wide env fallback exactly as it was (its cache, `/api/health`,
 * and `activeAIProviderName()` are all still correct for what they check -
 * neither has an organization in scope). The two request-scoped callers
 * that DO know which organization they're acting for (generateInsight,
 * sendTaskChatMessage) use these functions instead.
 */

async function buildFromOrgConfig(settings: OrgAiSettingsWithKey): Promise<AIProvider> {
  if (settings.provider === "anthropic") {
    const { AnthropicProvider } = await import("@/lib/ai/providers/anthropic");
    return new AnthropicProvider({ model: settings.model, apiKey: settings.apiKey });
  }

  const { OpenAICompatibleProvider } = await import("@/lib/ai/providers/openai-compatible");
  return OpenAICompatibleProvider.fromConfig(settings.provider, settings.model, settings.apiKey);
}

/**
 * Resolves the AI provider to use for a given organization: its own
 * configured provider/model/key if it has one (organization_ai_settings),
 * otherwise the instance-wide env-based provider, otherwise null (AI not
 * available at all).
 */
export async function resolveAIProvider(
  organizationId: string,
  userId: string
): Promise<AIProvider | null> {
  const orgSettings = await getOrgAiSettingsWithKey(organizationId, userId);
  if (orgSettings) return await buildFromOrgConfig(orgSettings);

  if (activeAIProviderName()) return getAIProvider();

  return null;
}

/** Cheap "is AI usable for this org" check - no decryption, no provider construction. */
export async function isAIAvailableForOrg(organizationId: string, userId: string): Promise<boolean> {
  if (await getOrgAiSettingsSafe(organizationId, userId)) return true;
  return activeAIProviderName() !== null;
}
