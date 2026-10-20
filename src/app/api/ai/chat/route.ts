import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/data/current-user";
import { getProjectAccess } from "@/lib/data/project-access";
import { resolveAIProvider } from "@/lib/ai/resolve-provider";
import { isChatRateLimited, recordChatMessage } from "@/lib/ai/chat-rate-limit";
import { ALL_CHAT_TOOLS, runChatTool, type FoundTask } from "@/lib/ai/chat-tools";
import type { AIMessage } from "@/lib/ai/provider";
import { getWorkflowOverrides } from "@/lib/data/workflow";
import { resolveBoardColumns, resolvePriorities } from "@/lib/work/task-board";

const MAX_TOOL_ITERATIONS = 5;

function buildSystemPrompt(projectName: string, workflow: string): string {
  return (
    `You are the Guidon AI Assistant for the project "${projectName}". ` +
    `You can search the project's tasks, create tasks, edit them, change their ` +
    `status, comment on them, read a task's full context, and record/list ` +
    `attempts - and keep the rest of the project current: its decisions, ` +
    `knowledge sources, roadmap phases, memory (facts, rules, constraints) ` +
    `and tech stack. When the user says to remember something, log a ` +
    `decision or update the roadmap, do it with those tools. Use the tools ` +
    `available to you. Deleting a task only ever proposes the deletion - ` +
    `the user must click a confirm button themselves, so call ` +
    `propose_delete_task freely when asked to delete something; it is safe. ` +
    `Be concise. After using tools, summarize what you did in one or two ` +
    `sentences - the tool calls themselves are already shown to the user.\n\n` +
    workflow
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

  // The project's own columns and priorities (migration 060) - the tools take
  // their keys, and a model can't guess custom ones.
  const workflow = await getWorkflowOverrides(access.userId, projectId);
  const columns = resolveBoardColumns(workflow.columns)
    .map((c) => `${c.status} ("${c.label}"${c.isDone ? ", counts as done" : ""})`)
    .join(", ");
  const priorities = resolvePriorities(workflow.priorities)
    .map((p) => `${p.key} ("${p.label}")`)
    .join(", ");
  const workflowText = `Board columns, in order (status keys): ${columns}.\nPriorities, most important first (keys): ${priorities}.`;

  const messages: AIMessage[] = incomingMessages.map((m: { role: string; content: string }) => ({
    role: m.role === "user" ? "user" : "assistant",
    content: m.content,
  }));

  const actions: string[] = [];
  // Every task search_tasks found this turn, shown to the user as links.
  const tasks = new Map<string, FoundTask>();
  let pendingDelete: { taskId: string; title: string } | undefined;

  try {
    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const result = await provider.complete({
        system: buildSystemPrompt(access.project.name, workflowText),
        messages,
        tools: ALL_CHAT_TOOLS as unknown as Array<{ name: string; description: string; input_schema: object }>,
        maxTokens: 1000,
      });

      if (!result.tool_calls || result.tool_calls.length === 0) {
        return NextResponse.json({ text: result.text, actions, tasks: [...tasks.values()], pendingDelete });
      }

      messages.push({ role: "assistant", content: result.text, tool_calls: result.tool_calls });

      for (const call of result.tool_calls) {
        const toolResult = await runChatTool(call.name, call.args, projectId, access.userId);
        actions.push(toolResult.label ?? toolResult.summary);
        for (const task of toolResult.tasks ?? []) tasks.set(task.id, task);
        messages.push({ role: "tool", content: toolResult.summary, tool_call_id: call.id });

        if (toolResult.pendingDelete) {
          pendingDelete = toolResult.pendingDelete;
          return NextResponse.json({ text: "", actions, tasks: [...tasks.values()], pendingDelete });
        }
      }
    }

    return NextResponse.json({
      text: "I've made several changes - let me know if you'd like me to continue.",
      actions,
      tasks: [...tasks.values()],
      pendingDelete,
    });
  } catch (error) {
    console.error("[AI Chat API Error]:", error);
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
