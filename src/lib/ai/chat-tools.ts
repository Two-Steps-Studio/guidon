import "server-only";

import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { createClient } from "@/lib/supabase-server";
import {
  createTask,
  updateTask,
  postComment,
  loadAttempts,
  createAttempt,
} from "@/app/projects/[id]/work/actions";
import { getTaskAgentContext } from "@/lib/context/agent-context";
import type { TaskPriority, TaskStatus } from "@/types/task";
import type { AttemptOutcome } from "@/types/task";

/**
 * Tool list passed to AIProvider.complete({ tools }). Plain JSON Schema,
 * matching AICompletionInput["tools"]'s shape (src/lib/ai/provider.ts) -
 * not the zod schemas src/lib/mcp/http/tools.ts uses, since that's a
 * different SDK (the MCP protocol) with a different caller (Claude Code,
 * authenticated by API key). This chat has a logged-in browser session
 * instead, so its tools dispatch to the same Server Actions the UI itself
 * calls (see runChatTool below) - same permission checks, no API key
 * involved, no separate "AI agent" permission layer.
 *
 * "delete" is deliberately not a tool name here - see propose_delete_task's
 * own comment for why, and why its handler never actually deletes anything.
 */
export const CHAT_TOOLS = [
  {
    name: "create_task",
    description: "Create a new task in this project. Lands in the Backlog column unless a status is given.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short task title" },
        description: { type: "string", description: "Longer description, markdown allowed" },
        priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
        status: { type: "string", enum: ["backlog", "todo", "in_progress", "review", "done"] },
      },
      required: ["title"],
    },
  },
  {
    name: "update_task",
    description: "Edit an existing task's title, description, priority or due date. Does not change status - use set_task_status for that.",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
        due_date: { type: "string", description: "YYYY-MM-DD, or empty string to clear it" },
      },
      required: ["task_id"],
    },
  },
  {
    name: "set_task_status",
    description: "Move a task to a different board column.",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        status: { type: "string", enum: ["backlog", "todo", "in_progress", "review", "done"] },
      },
      required: ["task_id", "status"],
    },
  },
  {
    name: "comment_on_task",
    description: "Add a comment to a task.",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        content: { type: "string" },
      },
      required: ["task_id", "content"],
    },
  },
  {
    name: "get_task_context",
    description: "Read a task's full context: description, project memory, related decisions, previous attempts.",
    input_schema: {
      type: "object",
      properties: { task_id: { type: "string" } },
      required: ["task_id"],
    },
  },
  {
    name: "list_attempts",
    description: "List previously recorded attempts (what was tried, what happened) for a task.",
    input_schema: {
      type: "object",
      properties: { task_id: { type: "string" } },
      required: ["task_id"],
    },
  },
  {
    name: "record_attempt",
    description: "Record an attempt at a task: what was tried and what happened. Use after doing real work on a task, not for planning.",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        problem: { type: "string" },
        approach: { type: "string" },
        outcome: { type: "string", enum: ["failed", "partial", "succeeded"] },
        result: { type: "string" },
        failure_reason: { type: "string" },
        files_changed: { type: "string", description: "One file path per line" },
        related_pr_url: { type: "string" },
      },
      required: ["task_id", "problem", "approach", "outcome"],
    },
  },
  {
    name: "propose_delete_task",
    description: "Propose deleting a task. This never deletes anything by itself - it only shows the user a confirm button. Only call this when the user explicitly asked to delete something.",
    input_schema: {
      type: "object",
      properties: { task_id: { type: "string" } },
      required: ["task_id"],
    },
  },
] as const;

export interface ChatToolResult {
  ok: boolean;
  summary: string;
  pendingDelete?: { taskId: string; title: string };
}

/** MAX(sort_order) + 100 for a column, so a chat-created task lands after every existing card in it - same spacing CreateTaskDialog uses (work-board.tsx). */
async function nextSortOrder(userId: string, projectId: string, status: TaskStatus): Promise<number> {
  if (hasDirectDatabase()) {
    const result = await withUser(userId, ({ query }) =>
      query("SELECT COALESCE(MAX(sort_order), 0) AS max FROM tasks WHERE project_id = $1 AND status = $2", [
        projectId,
        status,
      ])
    );
    return Number(result.rows[0]?.max ?? 0) + 100;
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("tasks")
    .select("sort_order")
    .eq("project_id", projectId)
    .eq("status", status)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.sort_order ?? 0) + 100;
}

/** Task title for a propose_delete_task confirmation prompt - project-scoped, so a task_id from another project never leaks a title into this chat. */
async function taskTitleInProject(userId: string, projectId: string, taskId: string): Promise<string | null> {
  if (hasDirectDatabase()) {
    const result = await withUser(userId, ({ query }) =>
      query("SELECT title FROM tasks WHERE id = $1 AND project_id = $2", [taskId, projectId])
    );
    return (result.rows[0]?.title as string | undefined) ?? null;
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("tasks")
    .select("title")
    .eq("id", taskId)
    .eq("project_id", projectId)
    .maybeSingle();
  return data?.title ?? null;
}

export async function runChatTool(
  name: string,
  args: Record<string, unknown>,
  projectId: string,
  userId: string
): Promise<ChatToolResult> {
  // A tool call's args come from the AI provider's parsed response (e.g.
  // src/lib/ai/providers/openai-compatible.ts does a bare JSON.parse with no
  // validation), so a malformed or missing payload - null, an array, a
  // primitive - must not reach the handlers below as-is; normalize to a
  // plain object first so every `str()`/`typeof args[key]` read is safe.
  const safeArgs: Record<string, unknown> = args && typeof args === "object" ? args : {};
  const str = (key: string): string => (typeof safeArgs[key] === "string" ? (safeArgs[key] as string) : "");

  switch (name) {
    case "create_task": {
      const title = str("title");
      if (!title.trim()) return { ok: false, summary: "create_task needs a title." };
      const status = (str("status") || "backlog") as TaskStatus;
      const sortOrder = await nextSortOrder(userId, projectId, status);
      const result = await createTask(projectId, {
        title,
        description: str("description"),
        status,
        priority: (str("priority") || "medium") as TaskPriority,
        assigneeId: "",
        dueDate: "",
        sortOrder,
      });
      if (result.error || !result.task) return { ok: false, summary: `Could not create task: ${result.error}` };
      return { ok: true, summary: `Created task: ${result.task.title}` };
    }

    case "update_task": {
      const taskId = str("task_id");
      if (!taskId) return { ok: false, summary: "update_task needs a task_id." };
      const patch: Record<string, unknown> = {};
      if (typeof safeArgs.title === "string") patch.title = safeArgs.title;
      if (typeof safeArgs.description === "string") patch.description = safeArgs.description;
      if (typeof safeArgs.priority === "string") patch.priority = safeArgs.priority;
      if (typeof safeArgs.due_date === "string") patch.due_date = safeArgs.due_date || null;
      const result = await updateTask(projectId, taskId, patch as Parameters<typeof updateTask>[2]);
      if (result.error || !result.task) return { ok: false, summary: `Could not update task: ${result.error}` };
      return { ok: true, summary: `Updated task: ${result.task.title}` };
    }

    case "set_task_status": {
      const taskId = str("task_id");
      const status = str("status") as TaskStatus;
      if (!taskId || !status) return { ok: false, summary: "set_task_status needs a task_id and status." };
      const result = await updateTask(projectId, taskId, { status } as Parameters<typeof updateTask>[2]);
      if (result.error || !result.task) return { ok: false, summary: `Could not change status: ${result.error}` };
      return { ok: true, summary: `Moved "${result.task.title}" to ${status}` };
    }

    case "comment_on_task": {
      const taskId = str("task_id");
      const content = str("content");
      if (!taskId || !content.trim()) return { ok: false, summary: "comment_on_task needs a task_id and content." };
      const result = await postComment(projectId, taskId, content);
      if (result.error || !result.comment) return { ok: false, summary: `Could not add comment: ${result.error}` };
      return { ok: true, summary: "Added a comment" };
    }

    case "get_task_context": {
      const taskId = str("task_id");
      if (!taskId) return { ok: false, summary: "get_task_context needs a task_id." };
      const result = await getTaskAgentContext(projectId, taskId);
      if (result.error) return { ok: false, summary: `Could not read task context: ${result.error}` };
      return { ok: true, summary: result.markdown };
    }

    case "list_attempts": {
      const taskId = str("task_id");
      if (!taskId) return { ok: false, summary: "list_attempts needs a task_id." };
      const result = await loadAttempts(projectId, taskId);
      if (result.error) return { ok: false, summary: `Could not load attempts: ${result.error}` };
      if (result.attempts.length === 0) return { ok: true, summary: "No attempts recorded yet." };
      return {
        ok: true,
        summary: result.attempts
          .map((a) => `[${a.outcome}] ${a.problem} -> ${a.approach}`)
          .join("\n"),
      };
    }

    case "record_attempt": {
      const taskId = str("task_id");
      const problem = str("problem");
      const approach = str("approach");
      const outcome = str("outcome") as AttemptOutcome;
      if (!taskId || !problem.trim() || !approach.trim() || !outcome) {
        return { ok: false, summary: "record_attempt needs task_id, problem, approach and outcome." };
      }
      const result = await createAttempt(projectId, {
        task_id: taskId,
        problem,
        approach,
        outcome,
        result: str("result"),
        failure_reason: str("failure_reason"),
        files_changed: str("files_changed"),
        related_pr_url: str("related_pr_url"),
        agent: "Guidon AI Assistant",
      });
      if (result.error || !result.attempt) return { ok: false, summary: `Could not record attempt: ${result.error}` };
      return { ok: true, summary: "Recorded attempt" };
    }

    case "propose_delete_task": {
      const taskId = str("task_id");
      if (!taskId) return { ok: false, summary: "propose_delete_task needs a task_id." };
      const title = await taskTitleInProject(userId, projectId, taskId);
      if (!title) return { ok: false, summary: "That task was not found in this project." };
      return { ok: true, summary: `Proposed deleting: ${title}`, pendingDelete: { taskId, title } };
    }

    default:
      return { ok: false, summary: `Unknown tool: ${name}` };
  }
}
