import "server-only";

import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { createClient } from "@/lib/supabase-server";
import { dataClient } from "@/lib/data-client";
import { createTask, updateTask } from "@/app/projects/[id]/work/actions";
import { postComment } from "@/app/projects/[id]/work/comments-actions";
import { loadAttempts, createAttempt } from "@/app/projects/[id]/work/attempts-actions";
import { getTaskAgentContext } from "@/lib/context/agent-context";
import { z } from "zod";
import { PROJECT_RESOURCES, type ProjectResource } from "@/lib/api/project-resources";
import { resourceOps } from "@/lib/api/project-resource-routes";
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
    name: "search_tasks",
    description:
      "Find tasks in this project by words in the title or description, and/or by status, priority or assignment to the current user. " +
      "Use it whenever the user asks about tasks without giving an exact one (\"what's left in review?\", \"find the login bug\", \"my tasks\"), " +
      "and before update/status/comment calls when you only know a task by name. Returns ids, titles and fields; the user also sees the matches as links.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Words to look for in title or description (optional)" },
        status: { type: "string", description: "A column key from the project's columns (listed in your instructions)" },
        priority: { type: "string", description: "A priority key from the project's priorities (listed in your instructions)" },
        assigned_to_me: { type: "boolean", description: "Only tasks assigned to the user chatting" },
        include_done: { type: "boolean", description: "Include done tasks when no status is given (default false)" },
        limit: { type: "number", description: "Max results, default 10, at most 25" },
      },
    },
  },
  {
    name: "create_task",
    description: "Create a new task in this project. Lands in the Backlog column unless a status is given.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short task title" },
        description: { type: "string", description: "Longer description, markdown allowed" },
        priority: { type: "string", description: "A priority key from the project's priorities (listed in your instructions)" },
        status: { type: "string", description: "A column key from the project's columns (listed in your instructions)" },
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
        priority: { type: "string", description: "A priority key from the project's priorities (listed in your instructions)" },
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
        status: { type: "string", description: "A column key from the project's columns (listed in your instructions)" },
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

/** JSON Schema of a zod object, as the providers' tool definitions take it. */
function jsonSchemaOf(schema: z.ZodObject<z.ZodRawShape>, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const json = z.toJSONSchema(schema) as Record<string, unknown> & { properties?: Record<string, unknown>; required?: string[] };
  delete json.$schema;
  return { ...json, properties: { ...extra, ...json.properties }, required: [...Object.keys(extra), ...(json.required ?? [])] };
}

/**
 * The rest of the project - decisions, knowledge, roadmap, memory, tech
 * stack - from the same descriptions as their API routes and MCP tools
 * (lib/api/project-resources.ts), so "remember that...", "log the decision
 * to...", "move the roadmap phase..." work in this chat too. List, create
 * and update only: like tasks, nothing is deleted from here.
 */
export const RESOURCE_CHAT_TOOLS = PROJECT_RESOURCES.flatMap((resource) => {
  const words = resource.noun.replace(/_/g, " ");
  return [
    {
      name: `list_${resource.plural}`,
      description: `${resource.summary}. Lists this project's ${resource.plural.replace(/_/g, " ")} (newest or roadmap order).`,
      input_schema: { type: "object", properties: {} },
    },
    {
      name: `create_${resource.noun}`,
      description: `Add a ${words} to this project when the user asks for it (${resource.summary.charAt(0).toLowerCase()}${resource.summary.slice(1)}).`,
      input_schema: jsonSchemaOf(resource.create),
    },
    {
      name: `update_${resource.noun}`,
      description: `Change some fields of one ${words}; get its id from list_${resource.plural} first.`,
      input_schema: jsonSchemaOf(resource.update, { id: { type: "string", description: `The ${words}'s id.` } }),
    },
  ];
});

/** Every tool this chat offers. */
export const ALL_CHAT_TOOLS = [...CHAT_TOOLS, ...RESOURCE_CHAT_TOOLS];

/** One line per item for the model: id plus its name/title/content and status. */
function describeItems(resource: ProjectResource, rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return `No ${resource.plural.replace(/_/g, " ")} yet.`;
  return rows
    .slice(0, 40)
    .map((row) => {
      const name = String(row.title ?? row.name ?? row.content ?? "").slice(0, 160);
      const extras = ["status", "decision_type", "memory_type", "category", "version", "completion_percentage", "planned_end_date", "verified"]
        .filter((key) => row[key] !== undefined && row[key] !== null)
        .map((key) => `${key} ${row[key]}`)
        .join(", ");
      return `- ${name} (id ${row.id}${extras ? `; ${extras}` : ""})`;
    })
    .join("\n");
}

async function runResourceTool(name: string, args: Record<string, unknown>, projectId: string, userId: string): Promise<ChatToolResult | null> {
  const match = name.match(/^(list|create|update)_(.+)$/);
  if (!match) return null;
  const [, verb, rest] = match;
  const resource = PROJECT_RESOURCES.find((r) => (verb === "list" ? r.plural : r.noun) === rest);
  if (!resource) return null;

  const ops = resourceOps(resource, dataClient(userId), userId, projectId, "assistant");
  const words = resource.noun.replace(/_/g, " ");
  const titleOf = (row: Record<string, unknown>) => String(row.title ?? row.name ?? row.content ?? "").slice(0, 80);

  if (verb === "list") {
    const result = await ops.list();
    const rows = (result.body[resource.listKey] as Record<string, unknown>[] | undefined) ?? [];
    if (result.status !== 200) return { ok: false, summary: String(result.body.error), label: `Could not read ${resource.plural.replace(/_/g, " ")}` };
    return { ok: true, summary: describeItems(resource, rows), label: `Read ${resource.plural.replace(/_/g, " ")}: ${rows.length}` };
  }

  const { id, ...fields } = args;
  const result = verb === "create" ? await ops.create(fields) : await ops.update(typeof id === "string" ? id : "", fields);
  if (result.status >= 300) return { ok: false, summary: `Could not ${verb} the ${words}: ${String(result.body.error)}` };
  const row = result.body[resource.itemKey] as Record<string, unknown>;
  return { ok: true, summary: `${verb === "create" ? "Added" : "Updated"} ${words}: ${titleOf(row)} (id ${row.id})` };
}

export interface FoundTask {
  id: string;
  title: string;
  status: string;
  priority: string;
}

export interface ChatToolResult {
  ok: boolean;
  /** What the model reads back. */
  summary: string;
  /** What the user sees as the action line; the summary when absent. Read
   *  tools set it - their summary (a task's whole context) is for the model. */
  label?: string;
  /** Matches to show as links (search_tasks). */
  tasks?: FoundTask[];
  pendingDelete?: { taskId: string; title: string };
}

/** % and _ are LIKE wildcards; a search for "50%" means the literal text. */
function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

type TaskSearchRow = FoundTask & { due_date: string | Date | null; assignee_id: string | null; sort_order: number | null };

async function searchTasks(userId: string, projectId: string, args: Record<string, unknown>): Promise<ChatToolResult> {
  const query = typeof args.query === "string" ? args.query.trim().slice(0, 200) : "";
  const status = typeof args.status === "string" ? args.status : "";
  const priority = typeof args.priority === "string" ? args.priority : "";
  const limit = Math.min(Math.max(Math.floor(Number(args.limit) || 10), 1), 25);

  // Title and description matched as two queries (the data client has no
  // OR), merged by id; RLS keeps both to what this user can see.
  const run = (column: "title" | "description" | null) => {
    let builder = dataClient(userId)
      .from("tasks")
      .select<TaskSearchRow>("id, title, status, priority, due_date, assignee_id, sort_order")
      .eq("project_id", projectId);
    if (column) builder = builder.ilike(column, likePattern(query));
    if (status) builder = builder.eq("status", status);
    else if (args.include_done !== true) builder = builder.eq("is_done", false);
    if (priority) builder = builder.eq("priority", priority);
    if (args.assigned_to_me === true) builder = builder.eq("assignee_id", userId);
    return builder.order("updated_at", { ascending: false }).limit(limit);
  };

  const results = query ? await Promise.all([run("title"), run("description")]) : [await run(null)];
  const failed = results.find((result) => result.error);
  if (failed?.error) return { ok: false, summary: `Could not search tasks: ${failed.error.message}`, label: "Task search failed" };

  const seen = new Set<string>();
  const rows = results
    .flatMap((result) => result.data ?? [])
    .filter((row) => !seen.has(row.id) && seen.add(row.id))
    .slice(0, limit);

  const filters = [query && `"${query}"`, status, priority, args.assigned_to_me === true && "assigned to you"].filter(Boolean).join(", ");
  const label = `Searched tasks${filters ? ` (${filters})` : ""}: ${rows.length} found`;
  if (rows.length === 0) return { ok: true, summary: "No matching tasks.", label, tasks: [] };

  const due = (value: string | Date | null) => (value ? new Date(value).toISOString().slice(0, 10) : null);
  return {
    ok: true,
    label,
    tasks: rows.map(({ id, title, status, priority }) => ({ id, title, status, priority })),
    summary: rows
      .map(
        (row) =>
          `- ${row.title} (id ${row.id}; ${row.status}, ${row.priority}` +
          `${due(row.due_date) ? `, due ${due(row.due_date)}` : ""}` +
          `${row.assignee_id === userId ? ", assigned to the user" : row.assignee_id ? ", assigned to someone else" : ", unassigned"})`
      )
      .join("\n"),
  };
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
    case "search_tasks":
      return searchTasks(userId, projectId, safeArgs);

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
      return { ok: true, summary: result.markdown, label: "Read the task's context" };
    }

    case "list_attempts": {
      const taskId = str("task_id");
      if (!taskId) return { ok: false, summary: "list_attempts needs a task_id." };
      const result = await loadAttempts(projectId, taskId);
      if (result.error) return { ok: false, summary: `Could not load attempts: ${result.error}` };
      if (result.attempts.length === 0) return { ok: true, summary: "No attempts recorded yet." };
      return {
        ok: true,
        label: `Read ${result.attempts.length} recorded attempt(s)`,
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
      return (await runResourceTool(name, safeArgs, projectId, userId)) ?? { ok: false, summary: `Unknown tool: ${name}` };
  }
}
