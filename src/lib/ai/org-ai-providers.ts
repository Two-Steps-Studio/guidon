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
 * `CUSTOM_MODEL` in ai-settings-form.tsx) since providers deprecate and
 * add models often enough that a hardcoded list WILL go stale - this
 * happened for real (llama-3.3-70b-versatile, Groq's deprecation
 * announced 2026-08-16) before this list had shipped a single day.
 *
 * Verified directly against each provider's own docs on 2026-08-28
 * (console.groq.com/docs/deprecations, developers.openai.com/api/docs/models,
 * openrouter.ai/anthropic, openrouter.ai/openai) rather than trained-in
 * knowledge - re-verify the same way before trusting this list again after
 * any "model not found" report.
 */
export const RECOMMENDED_MODELS: Record<OrgAiProviderName, readonly RecommendedModel[]> = {
  anthropic: [
    { value: "claude-opus-5", label: "Claude Opus 5 - most capable" },
    { value: "claude-sonnet-5", label: "Claude Sonnet 5 - fast, balanced" },
  ],
  openai: [
    { value: "gpt-5.6-sol", label: "GPT-5.6 Sol - most capable" },
    { value: "gpt-5.6-luna", label: "GPT-5.6 Luna - fast, cheap" },
  ],
  openrouter: [
    { value: "anthropic/claude-sonnet-5", label: "Claude Sonnet 5 - most capable" },
    { value: "openai/gpt-5.6-luna", label: "GPT-5.6 Luna - fast, cheap" },
  ],
  groq: [
    { value: "openai/gpt-oss-120b", label: "GPT-OSS 120B - most capable" },
    { value: "openai/gpt-oss-20b", label: "GPT-OSS 20B - fast, cheap" },
  ],
};
