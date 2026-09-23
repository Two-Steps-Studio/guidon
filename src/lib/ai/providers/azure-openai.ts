import "server-only";

import type { AICompletionInput, AICompletionResult, AIProvider } from "../provider";
import { AI_REQUEST_TIMEOUT_MS, requireEnv } from "../provider";
import { fromOpenAIChoice, toOpenAIMessages, toOpenAITools, type OpenAIChoice } from "./wire-format";

const DEFAULT_API_VERSION = "2024-10-21";

/**
 * Azure OpenAI speaks the same chat-completions body/response shape as
 * OpenAICompatibleProvider, but its URL and auth are different enough to
 * warrant a separate file rather than a config branch there:
 *
 *   - deployment-scoped path (POST .../deployments/{deployment}/chat/completions)
 *     instead of a flat base URL - the "model" is chosen by which
 *     deployment you hit, not by a body field
 *   - api-version as a required query parameter
 *   - `api-key` header instead of `Authorization: Bearer`
 *
 * Message/tool translation and response parsing are shared with
 * OpenAICompatibleProvider through ./wire-format.ts.
 */
export class AzureOpenAIProvider implements AIProvider {
  readonly name = "azure-openai" as const;
  readonly model: string;
  private readonly endpoint: string;
  private readonly deployment: string;
  private readonly apiVersion: string;
  private readonly apiKey: string;

  constructor() {
    this.endpoint = requireEnv("AZURE_OPENAI_ENDPOINT", "azure-openai").replace(/\/$/, "");
    this.deployment = requireEnv("AZURE_OPENAI_DEPLOYMENT", "azure-openai");
    this.apiKey = requireEnv("AZURE_OPENAI_API_KEY", "azure-openai");
    this.apiVersion = process.env.AZURE_OPENAI_API_VERSION?.trim() || DEFAULT_API_VERSION;
    // AI_MODEL doesn't apply to Azure - the deployment name *is* the model
    // selection - but AIProvider.model is surfaced to callers (and the
    // health check), so report the deployment name there instead.
    this.model = this.deployment;
  }

  /** Pure request construction - no I/O, so it's unit-testable without a network stub. */
  buildRequest(input: AICompletionInput): {
    url: string;
    headers: Record<string, string>;
    body: Record<string, unknown>;
  } {
    return {
      url: `${this.endpoint}/openai/deployments/${this.deployment}/chat/completions?api-version=${this.apiVersion}`,
      headers: {
        "content-type": "application/json",
        "api-key": this.apiKey,
      },
      // No "model" field - the deployment in the URL already selects it.
      body: {
        messages: toOpenAIMessages(input.system, input.messages),
        ...toOpenAITools(input.tools),
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
      signal: AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) {
      throw new Error(`azure-openai request failed: ${res.status} ${(await res.text()).slice(0, 500)}`);
    }

    const data = (await res.json()) as { choices?: OpenAIChoice[]; model?: string };

    return {
      ...fromOpenAIChoice(data.choices?.[0]),
      model: data.model ?? this.model,
      provider: "azure-openai",
    };
  }
}
