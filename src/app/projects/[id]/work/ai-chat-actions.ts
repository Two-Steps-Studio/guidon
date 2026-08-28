"use server";

import { canWriteProject, getProjectAccess } from "@/lib/data/project-access";
import { resolveAIProvider } from "@/lib/ai/resolve-provider";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type ChatResult = { text: string; error: string | null };

// Bounds the prompt the same way gatherInsightContext (memory/actions.ts)
// bounds its context rows - this is a chat, not an export, so an unbounded
// history would just get truncated by the model anyway while still costing
// tokens on every turn.
const MAX_HISTORY_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 8000;

function buildSystemPrompt(projectName: string): string {
  return (
    `You are the task-planning assistant inside Guidon, a project management tool, ` +
    `helping with the project "${projectName}". Have a normal conversation: ask ` +
    `clarifying questions when the user's request is vague, and discuss scope, ` +
    `approach, or tradeoffs like a helpful teammate would. You have no tools or ` +
    `functions available - never attempt to call one; everything you produce is plain text.\n\n` +
    `Whenever the conversation contains enough concrete, actionable work to be worth ` +
    `turning into tasks - the user pastes a spec or requirements, describes a feature, ` +
    `or explicitly asks you to generate tasks - end your reply with a plain markdown ` +
    `\`\`\`json code block (ordinary text output, not a tool call) containing a JSON array ` +
    `of task objects, each shaped as {"title": string, "description": string, ` +
    `"priority": "low" | "medium" | "high" | "critical"}. ` +
    `Titles should be short (a few words); descriptions one or two sentences. ` +
    `Only include this block when you actually have concrete tasks to propose - if you're ` +
    `still gathering requirements, just ask your questions and omit it entirely.`
  );
}

/**
 * One turn of the Work board's AI task assistant
 * (src/app/projects/[id]/work/ai-task-chat.tsx). Only talks to the AI
 * provider - no database write happens here. The client parses the reply
 * through parseTaskProposals (src/lib/ai/task-proposal-parser.ts) and
 * creates any accepted tasks itself via the existing createTask action.
 */
export async function sendTaskChatMessage(
  projectId: string,
  history: ChatMessage[]
): Promise<ChatResult> {
  const access = await getProjectAccess(projectId);
  // Same tier as createTask/generateInsight - this is a write-adjacent
  // feature (it proposes new tasks), not a read.
  if (!access || !canWriteProject(access.role)) {
    return { text: "", error: "You do not have permission to use the AI task assistant." };
  }

  const provider = await resolveAIProvider(access.project.organization_id, access.userId);
  if (!provider) {
    return { text: "", error: "No AI provider is configured for this organization." };
  }

  const last = history[history.length - 1];
  if (!last || last.role !== "user" || !last.content.trim()) {
    return { text: "", error: "Nothing to send." };
  }

  const trimmedHistory = history
    .slice(-MAX_HISTORY_MESSAGES)
    .map((message) => ({ ...message, content: message.content.slice(0, MAX_MESSAGE_LENGTH) }));

  try {
    const result = await provider.complete({
      system: buildSystemPrompt(access.project.name),
      messages: trimmedHistory,
      maxTokens: 1000,
    });
    return { text: result.text.trim(), error: null };
  } catch (error) {
    return {
      text: "",
      error: error instanceof Error ? error.message : "Failed to reach the AI provider.",
    };
  }
}
