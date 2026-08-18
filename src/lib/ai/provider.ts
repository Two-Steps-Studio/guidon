/**
 * AI provider abstraction (TODO.md §6, §7).
 *
 * Guidon must not be locked to one AI vendor, and self-hosted users must be
 * able to run fully local AI (Ollama) without any project data leaving
 * their machine. The interface below is deliberately the smallest surface
 * a future concrete feature (e.g. generating an ai_insight from a memory
 * source — see src/app/projects/[id]/memory/) needs to call: one method,
 * plain text in and out. No tool-calling, no streaming, no multi-turn
 * state — TODO.md §18 frames MCP/agent context as an interface, not the
 * core data model, and that scope only starts once a real feature needs it.
 *
 * Five of the six providers (OpenAI, OpenRouter, Ollama, Azure OpenAI,
 * Custom) speak the same OpenAI-compatible chat-completions REST shape and
 * share one implementation (providers/openai-compatible.ts). Azure's URL
 * and auth convention differ enough (deployment-scoped path, api-version
 * query param, api-key header) that it gets its own thin file instead of a
 * config branch. Only Anthropic has a genuinely different wire format (the
 * Messages API), so it gets its own file too, with a plain fetch call —
 * this codebase avoids adding a vendor SDK dependency where a small fetch
 * call suffices (no @anthropic-ai/sdk or openai package in package.json).
 *
 * SERVER ONLY. Every provider reads a secret (API key) from the
 * environment or talks to a network endpoint chosen by the operator. Never
 * import this from a client component.
 */

import "server-only";

export type AIProviderName =
  | "anthropic"
  | "openai"
  | "openrouter"
  | "ollama"
  | "azure-openai"
  | "custom";

export interface AIMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AICompletionInput {
  system?: string;
  messages: AIMessage[];
  maxTokens?: number;
  temperature?: number;
}

export interface AICompletionResult {
  text: string;
  model: string;
  provider: AIProviderName;
}

export interface AIProvider {
  readonly name: AIProviderName;
  readonly model: string;

  complete(input: AICompletionInput): Promise<AICompletionResult>;
}

// ============================================
// CONFIG VALIDATION
// ============================================
//
// Read once, here, rather than duplicated in every provider file — the same
// philosophy as assertSafeStoragePath/assertSafeBucket in
// storage/provider.ts: every provider is held to the same "missing config
// fails loudly" contract, even though each provider still owns which vars
// it actually needs.

/** Read a required env var, or throw an error naming both the provider and the var. */
export function requireEnv(name: string, providerName: AIProviderName): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `AI_PROVIDER=${providerName} requires ${name} to be set. See .env.example.`
    );
  }

  return value;
}

/**
 * AI_MODEL is required for every provider except Azure, which selects the
 * model via AZURE_OPENAI_DEPLOYMENT instead. There is no default to guess —
 * a wrong default model name fails in a more confusing way than an explicit
 * "set AI_MODEL" error.
 */
export function requireModel(providerName: AIProviderName): string {
  return requireEnv("AI_MODEL", providerName);
}

// ============================================
// FACTORY
// ============================================

const VALID_PROVIDER_NAMES: readonly AIProviderName[] = [
  "anthropic",
  "openai",
  "openrouter",
  "ollama",
  "azure-openai",
  "custom",
];

/**
 * Resolve the configured provider name, or `null` if AI is not configured.
 *
 * Unlike storage (which always needs a working provider), AI is an
 * optional subsystem — the health check treats an unset AI_PROVIDER as a
 * valid "not configured" state, not an error. So there is deliberately no
 * default here: defaulting to a cloud provider would silently start
 * sending project data off-device, and defaulting to "ollama" would
 * silently assume a local daemon that may not even be running. The
 * operator opts in explicitly by setting AI_PROVIDER.
 */
export function resolveProviderName(): AIProviderName | null {
  const configured = process.env.AI_PROVIDER?.trim().toLowerCase();

  if (!configured) return null;

  if ((VALID_PROVIDER_NAMES as readonly string[]).includes(configured)) {
    return configured as AIProviderName;
  }

  throw new Error(
    `Unknown AI_PROVIDER "${configured}". Expected one of: ${VALID_PROVIDER_NAMES.join(", ")}.`
  );
}

let cached: AIProvider | null = null;

/**
 * Resolve the configured provider. Cached per process — the provider holds
 * no request state, so a single instance is correct and avoids re-reading
 * env and re-validating config on every call.
 *
 * Throws if AI_PROVIDER is unset or its config is incomplete/invalid — same
 * philosophy as the storage factory's s3 branch: a provider that silently
 * no-ops (or silently sends data to the wrong place) is worse than a clear
 * failure. Callers that treat "AI not configured" as a legitimate, expected
 * state (e.g. the health check) should call activeAIProviderName() first
 * and only call getAIProvider() when it returns non-null.
 */
export async function getAIProvider(): Promise<AIProvider> {
  if (cached) return cached;

  const name = resolveProviderName();

  if (!name) {
    throw new Error(
      `AI_PROVIDER is not set. Set it to one of: ${VALID_PROVIDER_NAMES.join(", ")}. See .env.example.`
    );
  }

  switch (name) {
    case "anthropic": {
      const { AnthropicProvider } = await import("./providers/anthropic");
      cached = new AnthropicProvider();
      break;
    }

    case "openai": {
      const { OpenAICompatibleProvider } = await import("./providers/openai-compatible");
      cached = OpenAICompatibleProvider.forOpenAI();
      break;
    }

    case "openrouter": {
      const { OpenAICompatibleProvider } = await import("./providers/openai-compatible");
      cached = OpenAICompatibleProvider.forOpenRouter();
      break;
    }

    case "ollama": {
      const { OpenAICompatibleProvider } = await import("./providers/openai-compatible");
      cached = OpenAICompatibleProvider.forOllama();
      break;
    }

    case "custom": {
      const { OpenAICompatibleProvider } = await import("./providers/openai-compatible");
      cached = OpenAICompatibleProvider.forCustom();
      break;
    }

    case "azure-openai": {
      const { AzureOpenAIProvider } = await import("./providers/azure-openai");
      cached = new AzureOpenAIProvider();
      break;
    }
  }

  return cached;
}

/** Testing seam; also used by the health check to report the active provider. */
export function activeAIProviderName(): AIProviderName | null {
  return resolveProviderName();
}
