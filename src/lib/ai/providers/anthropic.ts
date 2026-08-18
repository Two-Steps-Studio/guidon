import "server-only";

import type { AICompletionInput, AICompletionResult, AIProvider } from "../provider";
import { requireEnv, requireModel } from "../provider";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MAX_TOKENS = 1024;

/**
 * Native fetch, no SDK — the Messages API is a single POST with a plain
 * JSON body, and this codebase avoids adding a vendor SDK dependency where
 * a small fetch call suffices (no @anthropic-ai/sdk in package.json). This
 * is the one provider that doesn't fit the OpenAI-compatible shape shared
 * by the rest: a different endpoint, a different auth header (`x-api-key`,
 * not `Authorization`), a required `anthropic-version` header, and `system`
 * as a top-level request field rather than a message with role "system".
 */
export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic" as const;
  readonly model: string;
  private readonly apiKey: string;

  constructor() {
    this.apiKey = requireEnv("ANTHROPIC_API_KEY", "anthropic");
    this.model = requireModel("anthropic");
  }

  /** Pure request construction — no I/O, so it's unit-testable without a network stub. */
  buildRequest(input: AICompletionInput): {
    url: string;
    headers: Record<string, string>;
    body: Record<string, unknown>;
  } {
    return {
      url: ANTHROPIC_API_URL,
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: {
        model: this.model,
        ...(input.system ? { system: input.system } : {}),
        messages: input.messages,
        max_tokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
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
      throw new Error(`anthropic request failed: ${res.status} ${(await res.text()).slice(0, 500)}`);
    }

    const data = (await res.json()) as {
      content?: { type: string; text?: string }[];
      model?: string;
    };

    return {
      text: data.content?.find((block) => block.type === "text")?.text ?? "",
      model: data.model ?? this.model,
      provider: "anthropic",
    };
  }
}
