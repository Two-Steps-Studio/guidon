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

export interface RecommendedModel {
  value: string;
  label: string;
}

/**
 * Two curated picks per provider so the settings form can offer a dropdown
 * instead of forcing a hand-typed model id - typing one correctly (and
 * knowing which one is actually good) is the friction this removes. A
 * "type it myself" escape hatch stays available for anything else (see
 * `CUSTOM_MODEL` in ai-settings-form.tsx) since providers add new models
 * far more often than this list can be updated.
 */
export const RECOMMENDED_MODELS: Record<OrgAiProviderName, readonly RecommendedModel[]> = {
  anthropic: [
    { value: "claude-opus-5", label: "Claude Opus 5 - most capable" },
    { value: "claude-sonnet-5", label: "Claude Sonnet 5 - fast, balanced" },
  ],
  openai: [
    { value: "gpt-5.1", label: "GPT-5.1 - most capable" },
    { value: "gpt-5.1-mini", label: "GPT-5.1 mini - fast, cheap" },
  ],
  openrouter: [
    { value: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5 - most capable" },
    { value: "openai/gpt-oss-120b", label: "GPT-OSS 120B - fast, cheap" },
  ],
  groq: [
    { value: "llama-3.3-70b-versatile", label: "Llama 3.3 70B - most capable" },
    { value: "openai/gpt-oss-120b", label: "GPT-OSS 120B - fast, cheap" },
  ],
};
