/**
 * Turns a chat completion's raw text into displayable prose plus a list of
 * proposed tasks, for the Work board's AI task assistant
 * (src/app/projects/[id]/work/ai-task-chat.tsx).
 *
 * AIProvider.complete() is deliberately "plain text in, plain text out" -
 * no tool-calling (see src/lib/ai/provider.ts's doc comment) - so structured
 * task proposals are carried as a plain fenced ```json code block at the end
 * of the model's reply (see the system prompt built in ai-chat-actions.ts).
 * Deliberately NOT a custom-named fence like ```guidon-tasks: some models
 * (confirmed with Groq's gpt-oss models) are trained hard enough on native
 * tool-calling that a fence label resembling a function name gets treated as
 * an actual tool invocation attempt, which the provider then rejects outright
 * (400 "tool_use_failed") since no tools were declared on the request - a
 * plain, universally-recognized ```json fence carries no such name to latch
 * onto. If the last fenced ```json block in a reply isn't a task array, this
 * just yields zero proposals - see sanitizeProposal below.
 *
 * This file is the tolerant other half of that contract: it never throws,
 * and a malformed or missing block just means zero proposals, not a broken
 * chat.
 *
 * No `server-only` import - this runs both on the server (the action could
 * validate here too) and in the client chat component that renders the
 * checkbox list, so it must stay a plain, dependency-light module.
 */

import { normalizeTaskPriority } from "@/lib/work/task-board";
import type { TaskPriority } from "@/types/task";

export interface TaskProposal {
  title: string;
  description: string;
  priority: TaskPriority;
}

export interface ParsedChatReply {
  /** The model's reply with the trailing ```json block (if any) stripped out. */
  prose: string;
  proposals: TaskProposal[];
}

// Global, so multiple ```json blocks can appear - only the LAST one is
// treated as the task proposal (matching "end your reply with..." in the
// system prompt); an earlier one could just be the model quoting JSON back
// as part of the conversation.
const TASK_BLOCK_PATTERN = /```json\s*([\s\S]*?)```/gi;

/** A proposal list this large is almost certainly a model mistake, not real work. */
const MAX_PROPOSALS = 30;

function sanitizeProposal(raw: unknown): TaskProposal | null {
  if (!raw || typeof raw !== "object") return null;

  const title = "title" in raw && typeof raw.title === "string" ? raw.title.trim() : "";
  if (!title) return null;

  const description =
    "description" in raw && typeof raw.description === "string" ? raw.description.trim() : "";

  const priority = normalizeTaskPriority(
    "priority" in raw && typeof raw.priority === "string" ? raw.priority : undefined
  );

  return { title, description, priority };
}

export function parseTaskProposals(text: string): ParsedChatReply {
  const matches = [...text.matchAll(TASK_BLOCK_PATTERN)];
  const match = matches[matches.length - 1];
  if (!match || match.index === undefined) {
    return { prose: text.trim(), proposals: [] };
  }

  const prose = (text.slice(0, match.index) + text.slice(match.index + match[0].length)).trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1]);
  } catch {
    return { prose, proposals: [] };
  }

  if (!Array.isArray(parsed)) {
    return { prose, proposals: [] };
  }

  const proposals = parsed
    .map(sanitizeProposal)
    .filter((proposal): proposal is TaskProposal => proposal !== null)
    .slice(0, MAX_PROPOSALS);

  return { prose, proposals };
}
