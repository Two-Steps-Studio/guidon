/**
 * Translation between the provider-neutral chat shape (AIMessage, tools,
 * AICompletionResult in ../provider.ts) and the two wire formats the
 * providers speak: OpenAI chat-completions (openai-compatible.ts,
 * azure-openai.ts) and Anthropic Messages (anthropic.ts).
 *
 * Only type imports, on purpose: Node's built-in type stripping can load
 * this file directly, so tests/ai/provider.test.mjs checks the real code
 * rather than a copy.
 */

import type { AICompletionInput, AICompletionResult, AIMessage } from "../provider";

type Tools = NonNullable<AICompletionInput["tools"]>;
type ToolCalls = NonNullable<AICompletionResult["tool_calls"]>;
type StopReason = AICompletionResult["stop_reason"];

// ============================================
// OpenAI chat-completions
// ============================================

export function toOpenAITools(tools: Tools | undefined): Record<string, unknown> {
  if (!tools || tools.length === 0) return {};
  return {
    tools: tools.map((tool) => ({
      type: "function",
      function: { name: tool.name, description: tool.description, parameters: tool.input_schema },
    })),
  };
}

export function toOpenAIMessages(system: string | undefined, messages: AIMessage[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = system ? [{ role: "system", content: system }] : [];
  for (const message of messages) {
    if (message.role === "tool") {
      out.push({ role: "tool", tool_call_id: message.tool_call_id ?? "", content: message.content });
    } else if (message.role === "assistant" && message.tool_calls?.length) {
      out.push({
        role: "assistant",
        content: message.content || null,
        tool_calls: message.tool_calls.map((call) => ({
          id: call.id,
          type: "function",
          function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) },
        })),
      });
    } else {
      out.push({ role: message.role, content: message.content });
    }
  }
  return out;
}

export interface OpenAIChoice {
  message?: {
    content?: string | null;
    tool_calls?: { id: string; function: { name: string; arguments: string } }[];
  };
  finish_reason?: string;
}

export function fromOpenAIChoice(choice: OpenAIChoice | undefined): Pick<AICompletionResult, "text" | "stop_reason" | "tool_calls"> {
  const toolCalls: ToolCalls = (choice?.message?.tool_calls ?? []).map((call) => ({
    id: call.id,
    name: call.function.name,
    args: parseArguments(call.function.arguments),
  }));
  const finish = choice?.finish_reason;
  const stopReason: StopReason =
    finish === "tool_calls" || finish === "function_call" ? "tool_use" : finish === "length" ? "max_tokens" : finish ? "stop" : undefined;
  return {
    text: choice?.message?.content ?? "",
    stop_reason: stopReason,
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
  };
}

/** Models occasionally emit invalid JSON arguments; an empty object lets the tool report the missing fields instead of failing the whole chat request. */
function parseArguments(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

// ============================================
// Anthropic Messages
// ============================================

export function toAnthropicTools(tools: Tools | undefined): Record<string, unknown> {
  if (!tools || tools.length === 0) return {};
  return {
    tools: tools.map((tool) => ({ name: tool.name, description: tool.description, input_schema: tool.input_schema })),
  };
}

type AnthropicBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicBlock[];
}

/**
 * The Messages API has no "system" or "tool" roles: system text is a
 * top-level field, a tool call is a `tool_use` block inside the assistant
 * turn, and its result is a `tool_result` block inside the next user turn.
 * All results for one assistant turn must arrive in a single user message,
 * so consecutive tool messages are merged.
 */
export function toAnthropicMessages(
  system: string | undefined,
  messages: AIMessage[]
): { system?: string; messages: AnthropicMessage[] } {
  const systemParts = system ? [system] : [];
  const out: AnthropicMessage[] = [];

  for (const message of messages) {
    if (message.role === "system") {
      systemParts.push(message.content);
    } else if (message.role === "tool") {
      const block: AnthropicBlock = { type: "tool_result", tool_use_id: message.tool_call_id ?? "", content: message.content };
      const last = out[out.length - 1];
      if (last && last.role === "user" && Array.isArray(last.content) && last.content.every((b) => b.type === "tool_result")) {
        last.content.push(block);
      } else {
        out.push({ role: "user", content: [block] });
      }
    } else if (message.role === "assistant" && message.tool_calls?.length) {
      const blocks: AnthropicBlock[] = message.content ? [{ type: "text", text: message.content }] : [];
      for (const call of message.tool_calls) {
        blocks.push({ type: "tool_use", id: call.id, name: call.name, input: call.args ?? {} });
      }
      out.push({ role: "assistant", content: blocks });
    } else {
      out.push({ role: message.role, content: message.content });
    }
  }

  return { ...(systemParts.length > 0 ? { system: systemParts.join("\n\n") } : {}), messages: out };
}

export interface AnthropicResponseBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

export function fromAnthropicContent(
  content: AnthropicResponseBlock[] | undefined,
  stopReason: string | undefined
): Pick<AICompletionResult, "text" | "stop_reason" | "tool_calls"> {
  const blocks = content ?? [];
  const toolCalls: ToolCalls = blocks
    .filter((block) => block.type === "tool_use" && block.id && block.name)
    .map((block) => ({ id: block.id as string, name: block.name as string, args: block.input ?? {} }));
  return {
    text: blocks
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("\n"),
    stop_reason:
      stopReason === "tool_use" ? "tool_use" : stopReason === "max_tokens" ? "max_tokens" : stopReason ? "stop" : undefined,
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
  };
}
