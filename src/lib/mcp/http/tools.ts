import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/work/task-board";
import { GET as listProjects } from "@/app/api/v1/projects/route";
import { GET as listTasks, POST as createTask } from "@/app/api/v1/projects/[projectId]/tasks/route";
import { GET as getTask, PATCH as updateTask, DELETE as deleteTask } from "@/app/api/v1/tasks/[taskId]/route";
import { POST as startTask } from "@/app/api/v1/tasks/[taskId]/start/route";
import { PATCH as setTaskStatus } from "@/app/api/v1/tasks/[taskId]/status/route";
import { POST as completeTask } from "@/app/api/v1/tasks/[taskId]/complete/route";
import { POST as commentOnTask } from "@/app/api/v1/tasks/[taskId]/comment/route";
import { GET as getTaskContext } from "@/app/api/v1/tasks/[taskId]/context/route";
import { GET as listAttempts, POST as recordAttempt } from "@/app/api/v1/tasks/[taskId]/attempts/route";
import type { Dispatch } from "./dispatch";

/**
 * The MCP tool surface. Each tool is a thin adapter over one /api/v1 route
 * (see dispatch.ts): input schemas mirror that route's accepted fields and
 * enums, and only fields the caller actually supplied are forwarded, so the
 * route's own validation and defaults stay the single source of truth.
 *
 * Note there is no `search` tool: GET /api/v1/search authenticates with the
 * browser session (requireAuth), not an API key, so it cannot be dispatched
 * to on behalf of an API-key caller.
 */

const taskId = z.string().describe("The task's UUID.");
const projectId = z.string().describe("The project's UUID (from list_projects).");
const statusEnum = z.enum(TASK_STATUSES);
const priorityEnum = z.enum(TASK_PRIORITIES);

/** Drops keys whose value is undefined so omitted optional inputs are not sent. */
function defined(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
}

const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;

export function registerGuidonTools(server: McpServer, dispatch: Dispatch): void {
  server.registerTool(
    "list_projects",
    {
      description:
        "List the Guidon projects the API key's user is a member of (id, name, organization_id). " +
        "Start here to find the project_id that list_tasks and create_task need.",
      annotations: { title: "List projects", ...READ_ONLY },
    },
    () => dispatch(listProjects, undefined, { method: "GET", path: "/api/v1/projects" })
  );

  server.registerTool(
    "list_tasks",
    {
      description:
        "List the tasks of one project (capped at 1000), including their status and priority. " +
        "Use it to find the task to work on, then call get_task_context with its id.",
      inputSchema: { project_id: projectId },
      annotations: { title: "List tasks", ...READ_ONLY },
    },
    ({ project_id }) =>
      dispatch(listTasks, { projectId: project_id }, { method: "GET", path: `/api/v1/projects/${project_id}/tasks` })
  );

  server.registerTool(
    "get_task",
    {
      description:
        "Fetch a single task's fields (title, description, status, priority, due date). " +
        "For everything needed to actually do the work, prefer get_task_context.",
      inputSchema: { task_id: taskId },
      annotations: { title: "Get task", ...READ_ONLY },
    },
    ({ task_id }) => dispatch(getTask, { taskId: task_id }, { method: "GET", path: `/api/v1/tasks/${task_id}` })
  );

  server.registerTool(
    "create_task",
    {
      description:
        "Create a task in a project. Only `title` is required. A top-level task defaults to the `backlog` " +
        "status and `medium` priority; when `parent_task_id` is set the new task is a subtask and always " +
        "starts as `todo`/`medium` (status and priority are ignored).",
      inputSchema: {
        project_id: projectId,
        title: z.string().describe("Task title (required, non-empty)."),
        description: z.string().optional().describe("Longer description of the task."),
        priority: priorityEnum.optional().describe("Defaults to medium."),
        status: statusEnum.optional().describe("Board column to create the task in. Defaults to backlog."),
        due_date: z.string().optional().describe("Due date as an ISO 8601 date/time string."),
        parent_task_id: z.string().optional().describe("UUID of a parent task in the same project, to create a subtask."),
      },
      annotations: { title: "Create task", ...WRITE },
    },
    ({ project_id, ...fields }) =>
      dispatch(
        createTask,
        { projectId: project_id },
        { method: "POST", path: `/api/v1/projects/${project_id}/tasks`, body: defined(fields) }
      )
  );

  server.registerTool(
    "update_task",
    {
      description:
        "Edit a task's fields. Send only the fields to change; at least one is required. Status is not " +
        "changed here - use start_task, set_task_status or complete_task. `description` and `due_date` " +
        "can be cleared by passing null.",
      inputSchema: {
        task_id: taskId,
        title: z.string().optional().describe("New title (must be non-empty)."),
        description: z.string().nullable().optional().describe("New description; null or empty clears it."),
        priority: priorityEnum.optional(),
        due_date: z.string().nullable().optional().describe("ISO 8601 date/time; null or empty clears it."),
        sort_order: z.number().optional().describe("Position of the card within its column."),
      },
      annotations: { title: "Update task", ...WRITE, idempotentHint: true },
    },
    ({ task_id, ...fields }) =>
      dispatch(updateTask, { taskId: task_id }, { method: "PATCH", path: `/api/v1/tasks/${task_id}`, body: defined(fields) })
  );

  server.registerTool(
    "delete_task",
    {
      description: "Permanently delete a task. This cannot be undone; only use it when the user asked for it.",
      inputSchema: { task_id: taskId },
      annotations: { title: "Delete task", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    ({ task_id }) => dispatch(deleteTask, { taskId: task_id }, { method: "DELETE", path: `/api/v1/tasks/${task_id}` })
  );

  server.registerTool(
    "start_task",
    {
      description:
        "Mark a task as being worked on (moves it to the in-progress/AI-working column and records who started it). " +
        "Call it after get_task_context and before doing the work.",
      inputSchema: { task_id: taskId },
      annotations: { title: "Start task", ...WRITE, idempotentHint: true },
    },
    ({ task_id }) => dispatch(startTask, { taskId: task_id }, { method: "POST", path: `/api/v1/tasks/${task_id}/start` })
  );

  server.registerTool(
    "set_task_status",
    {
      description:
        "Move a task to a board column. When the work is finished, set `review` so a human can check it - " +
        "prefer this over complete_task. The project may restrict which status changes AI keys are allowed to make.",
      inputSchema: { task_id: taskId, status: statusEnum.describe("Target status.") },
      annotations: { title: "Set task status", ...WRITE, idempotentHint: true },
    },
    ({ task_id, status }) =>
      dispatch(setTaskStatus, { taskId: task_id }, { method: "PATCH", path: `/api/v1/tasks/${task_id}/status`, body: { status } })
  );

  server.registerTool(
    "complete_task",
    {
      description:
        "Mark a task as done. This only works if the project has enabled AI auto-complete and granted this " +
        "key permission to complete tasks; otherwise it fails. Prefer set_task_status with `review` so a " +
        "human confirms the result.",
      inputSchema: { task_id: taskId },
      annotations: { title: "Complete task", ...WRITE, idempotentHint: true },
    },
    ({ task_id }) => dispatch(completeTask, { taskId: task_id }, { method: "POST", path: `/api/v1/tasks/${task_id}/complete` })
  );

  server.registerTool(
    "comment_on_task",
    {
      description:
        "Post a comment on a task (attributed to this API key). Use it to summarise what you did, link the " +
        "PR and flag anything a reviewer should look at, after record_attempt and before moving the task to review.",
      inputSchema: { task_id: taskId, content: z.string().describe("Comment text (required, non-empty).") },
      annotations: { title: "Comment on task", ...WRITE },
    },
    ({ task_id, content }) =>
      dispatch(commentOnTask, { taskId: task_id }, { method: "POST", path: `/api/v1/tasks/${task_id}/comment`, body: { content } })
  );

  server.registerTool(
    "get_task_context",
    {
      description:
        "Get the full working context for a task as Markdown: the task itself, project constraints, facts and " +
        "insights, related decisions, files, PRs and sources, and previous attempts (so you do not repeat a " +
        "failed approach). Recommended workflow: get_task_context -> start_task -> do the work -> record_attempt " +
        "-> comment_on_task -> set_task_status `review`.",
      inputSchema: { task_id: taskId },
      annotations: { title: "Get task context", ...READ_ONLY },
    },
    ({ task_id }) => dispatch(getTaskContext, { taskId: task_id }, { method: "GET", path: `/api/v1/tasks/${task_id}/context` })
  );

  server.registerTool(
    "list_attempts",
    {
      description:
        "List the attempts previously recorded on a task, newest first (what was tried, the outcome and, for " +
        "failures, why). get_task_context already includes them; use this to read them on their own.",
      inputSchema: { task_id: taskId },
      annotations: { title: "List attempts", ...READ_ONLY },
    },
    ({ task_id }) => dispatch(listAttempts, { taskId: task_id }, { method: "GET", path: `/api/v1/tasks/${task_id}/attempts` })
  );

  server.registerTool(
    "record_attempt",
    {
      description:
        "Record an attempt at a task so future work (human or AI) learns from it - record failed and partial " +
        "attempts too, with the reason. Call it when you finish (or give up on) an approach, then " +
        "comment_on_task and set_task_status `review`. Requires the `attempts:write` scope.",
      inputSchema: {
        task_id: taskId,
        problem: z.string().describe("What you were trying to solve (required)."),
        approach: z.string().describe("What you did or tried (required)."),
        outcome: z.enum(["failed", "partial", "succeeded"]).describe("How it turned out."),
        result: z.string().optional().describe("What the result was."),
        failure_reason: z.string().optional().describe("Why it failed or only partly worked."),
        agent: z.string().optional().describe("Name of the agent/tool recording this attempt."),
        related_pr_url: z.string().optional().describe("http(s) URL of the related pull request."),
        files_changed: z.array(z.string()).optional().describe("Paths of the files the attempt changed."),
      },
      annotations: { title: "Record attempt", ...WRITE },
    },
    ({ task_id, ...fields }) =>
      dispatch(recordAttempt, { taskId: task_id }, { method: "POST", path: `/api/v1/tasks/${task_id}/attempts`, body: defined(fields) })
  );
}
