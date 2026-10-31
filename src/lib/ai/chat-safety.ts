import { z } from "zod";

export const MAX_CHAT_MESSAGES = 20;
export const chatRequestSchema = z.object({
  projectId: z.string().uuid(),
  sessionId: z.string().uuid().optional(),
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().max(8000),
  }).strict()).min(1).max(MAX_CHAT_MESSAGES),
}).refine(body => body.messages.at(-1)?.role === "user" && !!body.messages.at(-1)?.content.trim());

/** Provider bodies, network URLs and configuration errors never reach clients. */
export function safeChatFailure(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  if (name === "TimeoutError" || name === "AbortError") {
    return { code: "ai_timeout", error: "The AI request timed out. Please try again.", status: 504 };
  }
  if (error instanceof Error && /request failed: 429\b/.test(error.message)) {
    return { code: "ai_rate_limited", error: "The AI provider is busy. Please try again later.", status: 429 };
  }
  return { code: "ai_unavailable", error: "The AI provider could not complete this request.", status: 502 };
}
