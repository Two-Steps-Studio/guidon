import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/data/current-user";
import { getProjectAccess } from "@/lib/data/project-access";
import { resolveAIProvider } from "@/lib/ai/resolve-provider";
import { isChatRateLimited, recordChatMessage } from "@/lib/ai/chat-rate-limit";
import { CHAT_TOOLS, runChatTool } from "@/lib/ai/chat-tools";
import type { AIMessage } from "@/lib/ai/provider";

const MAX_TOOL_ITERATIONS = 5;

function buildSystemPrompt(projectName: string): string {
  return (
    `You are the Guidon AI Assistant for the project "${projectName}". ` +
    `You can create tasks, edit them, change their status, comment on them, ` +
    `read a task's full context, and record/list attempts, using the tools ` +
    `available to you. Deleting a task only ever proposes the deletion - ` +
    `the user must click a confirm button themselves, so call ` +
    `propose_delete_task freely when asked to delete something; it is safe. ` +
    `Be concise. After using tools, summarize what you did in one or two ` +
    `sentences - the tool calls themselves are already shown to the user.`
  );
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const projectId = typeof body?.projectId === "string" ? body.projectId : null;
  const incomingMessages = Array.isArray(body?.messages) ? body.messages : null;
  if (!projectId || !incomingMessages) {
    return NextResponse.json({ error: "projectId and messages are required" }, { status: 400 });
  }

  const access = await getProjectAccess(projectId);
  if (!access) {
    return NextResponse.json({ error: "No access to project" }, { status: 403 });
  }

  if (isChatRateLimited(access.userId, projectId)) {
    return NextResponse.json(
      { error: "You're sending messages too quickly - wait a few minutes and try again." },
      { status: 429 }
    );
  }
  recordChatMessage(access.userId, projectId);

  const provider = await resolveAIProvider(access.project.organization_id, access.userId);
  if (!provider) {
    return NextResponse.json({ error: "No AI provider is configured for this organization." }, { status: 400 });
  }

  const messages: AIMessage[] = incomingMessages.map((m: { role: string; content: string }) => ({
    role: m.role === "user" ? "user" : "assistant",
    content: m.content,
  }));

  const actions: string[] = [];
  let pendingDelete: { taskId: string; title: string } | undefined;

  try {
    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const result = await provider.complete({
        system: buildSystemPrompt(access.project.name),
        messages,
        tools: CHAT_TOOLS as unknown as Array<{ name: string; description: string; input_schema: object }>,
        maxTokens: 1000,
      });

      if (!result.tool_calls || result.tool_calls.length === 0) {
        return NextResponse.json({ text: result.text, actions, pendingDelete });
      }

      messages.push({ role: "assistant", content: result.text, tool_calls: result.tool_calls });

      for (const call of result.tool_calls) {
        const toolResult = await runChatTool(call.name, call.args, projectId, access.userId);
        actions.push(toolResult.summary);
        messages.push({ role: "tool", content: toolResult.summary, tool_call_id: call.id });

        if (toolResult.pendingDelete) {
          pendingDelete = toolResult.pendingDelete;
          return NextResponse.json({ text: "", actions, pendingDelete });
        }
      }
    }

    return NextResponse.json({
      text: "I've made several changes - let me know if you'd like me to continue.",
      actions,
      pendingDelete,
    });
  } catch (error) {
    console.error("[AI Chat API Error]:", error);
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
