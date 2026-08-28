import "server-only";

import type {
  AICompletionInput,
  AICompletionResult,
  AIProvider,
  AIProviderName,
} from "../provider";
import { requireEnv, requireModel } from "../provider";

/**
 * One class for the five providers that speak the OpenAI chat-completions
 * REST shape (POST {baseUrl}/chat/completions with a {model, messages, ...}
 * body, choices[0].message.content back). OpenAI, OpenRouter, Groq, Ollama
 * and a generic "custom" endpoint differ only in base URL, whether an API
 * key is required, and where that URL comes from - everything else is
 * identical, so duplicating it five times would just be five copies of the same fetch
 * call. Azure OpenAI reuses this body/response shape too, but its URL is
 * deployment-scoped with an api-version query param and an `api-key`
 * header instead of `Authorization: Bearer` - different enough to live in
 * its own file (azure-openai.ts) rather than become a config branch here.
 */
export class OpenAICompatibleProvider implements AIProvider {
  readonly name: AIProviderName;
  readonly model: string;
  private readonly baseUrl: string;
  private readonly apiKey?: string;

  private constructor(name: AIProviderName, baseUrl: string, model: string, apiKey?: string) {
    this.name = name;
    // Strip a trailing slash once here so URL joining never double-slashes.
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.model = model;
    this.apiKey = apiKey;
  }

  static forOpenAI(): OpenAICompatibleProvider {
    return new OpenAICompatibleProvider(
      "openai",
      "https://api.openai.com/v1",
      requireModel("openai"),
      requireEnv("OPENAI_API_KEY", "openai")
    );
  }

  static forOpenRouter(): OpenAICompatibleProvider {
    return new OpenAICompatibleProvider(
      "openrouter",
      "https://openrouter.ai/api/v1",
      requireModel("openrouter"),
      requireEnv("OPENROUTER_API_KEY", "openrouter")
    );
  }

  static forGroq(): OpenAICompatibleProvider {
    return new OpenAICompatibleProvider(
      "groq",
      "https://api.groq.com/openai/v1",
      requireModel("groq"),
      requireEnv("GROQ_API_KEY", "groq")
    );
  }

  /**
   * No API key required - this is the provider TODO.md §6 calls out by
   * name ("a user should be able to run Guidon without sending project
   * data to an external AI provider"). AI_BASE_URL defaults to a local
   * daemon on Ollama's standard port; its OpenAI-compatible surface lives
   * under /v1, appended here so the env var stays the plain host operators
   * already use for `ollama serve`.
   */
  static forOllama(): OpenAICompatibleProvider {
    const base = process.env.AI_BASE_URL?.trim() || "http://localhost:11434";
    return new OpenAICompatibleProvider(
      "ollama",
      `${base.replace(/\/$/, "")}/v1`,
      requireModel("ollama")
    );
  }

  /**
   * Any other OpenAI-compatible endpoint. The base URL has no safe default
   * (unlike Ollama, there's no standard host), so it's required. The API
   * key is optional - plenty of self-hosted gateways don't require one.
   */
  static forCustom(): OpenAICompatibleProvider {
    return new OpenAICompatibleProvider(
      "custom",
      requireEnv("AI_BASE_URL", "custom"),
      requireModel("custom"),
      process.env.AI_API_KEY?.trim() || undefined
    );
  }

  /**
   * Builds a provider from explicit values instead of env vars - used when
   * an organization has configured its own provider/model/key
   * (organization_ai_settings, resolved by src/lib/ai/resolve-provider.ts)
   * rather than relying on the instance-wide AI_PROVIDER/AI_MODEL/*_API_KEY.
   * Only the three OpenAI-compatible providers a plain key form can express
   * end up here - ollama needs no key, azure-openai/custom need fields this
   * shape doesn't have.
   */
  static fromConfig(
    name: "openai" | "openrouter" | "groq",
    model: string,
    apiKey: string
  ): OpenAICompatibleProvider {
    const baseUrl: Record<typeof name, string> = {
      openai: "https://api.openai.com/v1",
      openrouter: "https://openrouter.ai/api/v1",
      groq: "https://api.groq.com/openai/v1",
    };
    return new OpenAICompatibleProvider(name, baseUrl[name], model, apiKey);
  }

  /** Pure request construction - no I/O, so it's unit-testable without a network stub. */
  buildRequest(input: AICompletionInput): {
    url: string;
    headers: Record<string, string>;
    body: Record<string, unknown>;
  } {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.apiKey) {
      headers.authorization = `Bearer ${this.apiKey}`;
    }

    const messages = input.system
      ? [{ role: "system", content: input.system }, ...input.messages]
      : input.messages;

    return {
      url: `${this.baseUrl}/chat/completions`,
      headers,
      body: {
        model: this.model,
        messages,
        ...(input.maxTokens !== undefined ? { max_tokens: input.maxTokens } : {}),
        ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
      },
    };
  }

  async complete(input: AICompletionInput): Promise<AICompletionResult> {
    const { url, headers, body } = this.buildRequest(input);

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`${this.name} request failed: ${res.status} ${await safeErrorText(res)}`);
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      model?: string;
    };

    return {
      text: data.choices?.[0]?.message?.content ?? "",
      model: data.model ?? this.model,
      provider: this.name,
    };
  }
}

async function safeErrorText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return "";
  }
}
