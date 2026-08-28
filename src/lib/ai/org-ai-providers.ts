/**
 * The four AI providers an organization can configure from the app
 * (organization_ai_settings, migration 024) - the ones that need nothing
 * but a key. No `server-only` and no I/O: this is imported both by
 * src/lib/data/organization-ai-settings.ts (server) and by the settings
 * form (client) for its provider <select>, so it must stay a plain,
 * dependency-free module - pulling the data-access file's pg/Supabase
 * imports into the client bundle is exactly what this file avoids.
 */
export type OrgAiProviderName = "anthropic" | "openai" | "openrouter" | "groq";

export const ORG_AI_PROVIDER_NAMES: readonly OrgAiProviderName[] = [
  "anthropic",
  "openai",
  "openrouter",
  "groq",
];
