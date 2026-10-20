import { z } from "zod";
import { WORKFLOW_KEY_RE } from "@/lib/work/task-board";
import {
  ATTEMPT_FILES_MAX,
  ATTEMPT_FILE_PATH_MAX,
  ATTEMPT_PR_URL_MAX,
  ATTEMPT_TEXT_MAX,
} from "@/lib/api/attempt-limits";

/**
 * Request bodies of the /api/v1 task routes, shared by the MCP tools
 * (src/lib/mcp/http/tools.ts - input schemas) and the OpenAPI document
 * (src/lib/api/openapi.ts - request body schemas), so the two descriptions of
 * the same API can't drift apart. The routes' own validation stays the source
 * of truth for what is accepted; these mirror it.
 */

// Projects define their own columns and priorities (migration 060), so these
// are keys rather than fixed enums: list_columns / list_priorities (GET
// /projects/{id}/columns, /priorities) give a project's valid values.
export const statusEnum = z
  .string()
  .regex(WORKFLOW_KEY_RE)
  .describe("A column key of the task's project (list_columns). Built-in: backlog, todo, in_progress, ai_working, review, done.");
export const priorityEnum = z
  .string()
  .regex(WORKFLOW_KEY_RE)
  .describe("A priority key of the task's project (list_priorities). Built-in: low, medium, high, critical.");

export const createTaskFields = {
  title: z.string().describe("Task title (required, non-empty)."),
  description: z.string().optional().describe("Longer description of the task."),
  priority: priorityEnum.optional().describe("Defaults to medium."),
  status: statusEnum.optional().describe("Board column to create the task in. Defaults to backlog."),
  due_date: z.string().optional().describe("Due date as an ISO 8601 date/time string."),
  parent_task_id: z.string().optional().describe("UUID of a parent task in the same project, to create a subtask."),
};

export const updateTaskFields = {
  title: z.string().optional().describe("New title (must be non-empty)."),
  description: z.string().nullable().optional().describe("New description; null or empty clears it."),
  priority: priorityEnum.optional(),
  due_date: z.string().nullable().optional().describe("ISO 8601 date/time; null or empty clears it."),
  sort_order: z.number().optional().describe("Position of the card within its column."),
};

export const setStatusFields = { status: statusEnum.describe("Target status.") };

export const commentFields = { content: z.string().describe("Comment text (required, non-empty).") };

export const recordAttemptFields = {
  problem: z.string().max(ATTEMPT_TEXT_MAX).describe("What you were trying to solve (required)."),
  approach: z.string().max(ATTEMPT_TEXT_MAX).describe("What you did or tried (required)."),
  outcome: z.enum(["failed", "partial", "succeeded"]).describe("How it turned out."),
  result: z.string().max(ATTEMPT_TEXT_MAX).optional().describe("What the result was."),
  failure_reason: z.string().max(ATTEMPT_TEXT_MAX).optional().describe("Why it failed or only partly worked."),
  agent: z.string().max(ATTEMPT_TEXT_MAX).optional().describe("Name of the agent/tool recording this attempt."),
  related_pr_url: z.string().max(ATTEMPT_PR_URL_MAX).optional().describe("http(s) URL of the related pull request."),
  files_changed: z
    .array(z.string().max(ATTEMPT_FILE_PATH_MAX))
    .max(ATTEMPT_FILES_MAX)
    .optional()
    .describe(`Paths of the files the attempt changed (at most ${ATTEMPT_FILES_MAX}).`),
};
