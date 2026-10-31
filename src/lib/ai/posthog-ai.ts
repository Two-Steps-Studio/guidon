import "server-only";

import { randomUUID } from "node:crypto";
import { PostHog } from "posthog-node";
import type { AICompletionInput, AICompletionResult } from "@/lib/ai/provider";

const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN?.trim();
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim();

if (!projectToken && process.env.NODE_ENV === "development") {
  throw new Error(
    "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN is configured"
  );
}
if (!host && process.env.NODE_ENV === "development") {
  throw new Error(
    "NEXT_PUBLIC_POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_HOST is configured"
  );
}

const posthog = projectToken && host
  ? new PostHog(projectToken, { host, flushAt: 1, flushInterval: 0, privacyMode: false })
  : null;

function aiInput(input: AICompletionInput) {
  const messages: Array<{ role: "user" | "assistant" | "system"; content: string }> = [];
  if (input.system) messages.push({ role: "system", content: input.system });
  for (const message of input.messages) {
    messages.push({
      role: message.role === "tool" ? "user" : message.role,
      content: message.content,
    });
  }
  return messages;
}

async function capture(event: "$ai_generation" | "$ai_span", distinctId: string, properties: Record<string, unknown>) {
  if (!posthog) return;
  try {
    posthog.capture({ distinctId, event, properties });
    await posthog.flush();
  } catch {
    // AI observability must never block a configured provider response.
  }
}

export async function captureAIGeneration(
  input: AICompletionInput,
  result: AICompletionResult,
  latency: number
) {
  const context = input.observability;
  if (!context) return;

  await capture("$ai_generation", context.distinctId, {
    $ai_trace_id: context.traceId,
    $ai_session_id: context.sessionId,
    $ai_span_name: context.spanName,
    $ai_model: result.model,
    $ai_provider: result.provider,
    $ai_input: aiInput(input),
    $ai_output_choices: [{ role: "assistant", content: result.text }],
    $ai_latency: latency,
    ...(result.stop_reason ? { $ai_stop_reason: result.stop_reason } : {}),
    ...(input.maxTokens !== undefined ? { $ai_max_tokens: input.maxTokens } : {}),
    ...(input.temperature !== undefined ? { $ai_temperature: input.temperature } : {}),
    ...(input.tools?.length ? { $ai_tools: input.tools } : {}),
  });
}

export async function captureAIToolSpan({
  sessionId,
  traceId,
  distinctId,
  name,
  input,
  output,
  latency,
  error,
}: {
  sessionId: string | null;
  traceId: string;
  distinctId: string;
  name: string;
  input: Record<string, unknown>;
  output?: unknown;
  latency: number;
  error?: unknown;
}) {
  await capture("$ai_span", distinctId, {
    $ai_trace_id: traceId,
    $ai_session_id: sessionId,
    $ai_span_id: randomUUID(),
    $ai_parent_id: traceId,
    $ai_span_name: `tool:${name}`,
    $ai_input_state: input,
    ...(output !== undefined ? { $ai_output_state: output } : {}),
    $ai_latency: latency,
    ...(error ? { $ai_is_error: true, $ai_error: error instanceof Error ? error.name : "Error" } : {}),
  });
}
