import "server-only";

import { randomUUID } from "node:crypto";
import { PostHog } from "posthog-node";
import type { AICompletionInput, AICompletionResult } from "@/lib/ai/provider";

const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN?.trim();
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim();

// Optional: unset disables it. Only metadata is sent (model, latency, tool
// names) - never prompts, replies or tool data: the Privacy Policy doesn't
// list PostHog as a recipient of project content.
const posthog = projectToken && host
  ? new PostHog(projectToken, { host, flushAt: 1, flushInterval: 0, privacyMode: true })
  : null;

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
    $ai_latency: latency,
    ...(result.stop_reason ? { $ai_stop_reason: result.stop_reason } : {}),
    ...(input.maxTokens !== undefined ? { $ai_max_tokens: input.maxTokens } : {}),
    ...(input.temperature !== undefined ? { $ai_temperature: input.temperature } : {}),
    ...(input.tools?.length ? { $ai_tools: input.tools.map((tool) => tool.name) } : {}),
  });
}

export async function captureAIToolSpan({
  sessionId,
  traceId,
  distinctId,
  name,
  latency,
  error,
}: {
  sessionId: string | null;
  traceId: string;
  distinctId: string;
  name: string;
  latency: number;
  error?: unknown;
}) {
  await capture("$ai_span", distinctId, {
    $ai_trace_id: traceId,
    $ai_session_id: sessionId,
    $ai_span_id: randomUUID(),
    $ai_parent_id: traceId,
    $ai_span_name: `tool:${name}`,
    $ai_latency: latency,
    ...(error ? { $ai_is_error: true, $ai_error: error instanceof Error ? error.name : "Error" } : {}),
  });
}
