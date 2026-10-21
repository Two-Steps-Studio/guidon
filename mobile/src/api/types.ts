/**
 * Response shapes of the Guidon REST API (`/api/v1`), mirrored from the
 * server route handlers in `src/app/api/v1/**` and the OpenAPI schemas in
 * `src/lib/api/openapi.ts` of the main repository. Keep these in sync with
 * the server, not with what the app happens to need.
 */

/** A built-in board status, or the key of one of the project's own columns (migration 060). */
export type TaskStatus = string;
/** A built-in priority (low/medium/high/critical) or one the project defined. */
export type TaskPriority = string;

export const BUILTIN_STATUSES = ["backlog", "todo", "in_progress", "ai_working", "review", "done"] as const;
export type BuiltinStatus = (typeof BUILTIN_STATUSES)[number];

export const BUILTIN_PRIORITIES = ["critical", "high", "medium", "low"] as const;
export type BuiltinPriority = (typeof BUILTIN_PRIORITIES)[number];

/** Same rule as the server's WORKFLOW_KEY_RE (src/lib/work/task-board.ts). */
export const WORKFLOW_KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;

/** GET /api/v1/projects -> { projects: Project[] } */
export interface Project {
  id: string;
  name: string;
  organization_id: string;
}

/**
 * GET /api/v1/projects/{projectId}/columns -> { columns: Column[] }
 * Visible columns only, in board order. Labels are the English defaults
 * unless the project saved its own (the API has no locale).
 */
export interface Column {
  status: TaskStatus;
  label: string;
  is_done: boolean;
  custom: boolean;
  /** Hex colour of a custom column, or null. */
  color: string | null;
}

/** GET /api/v1/projects/{projectId}/priorities -> { priorities: Priority[] }, most important first. */
export interface Priority {
  key: TaskPriority;
  label: string;
  custom: boolean;
  color: string | null;
}

/**
 * A `tasks` row (`select("*")`). GET /api/v1/projects/{id}/tasks returns all
 * of a project's tasks, subtasks included (`parent_task_id` set).
 */
export interface Task {
  id: string;
  project_id: string;
  parent_task_id: string | null;
  title: string;
  description: string | null;
  /** May still hold a legacy value ("testing", "completed") on old rows. */
  status: TaskStatus;
  priority: TaskPriority;
  /** Kept by the database: in "done" or a column marked as done. */
  is_done?: boolean;
  done_at?: string | null;
  tags: string[];
  /** Calendar-day semantics: always UTC midnight of the picked day. */
  due_date: string | null;
  progress_percent?: number | null;
  assignee_id: string | null;
  sort_order: number | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

/** GET/POST /api/v1/tasks/{taskId}/comment */
export interface Comment {
  id: string;
  task_id: string;
  author_id: string;
  content: string;
  created_at: string;
  /** Set when an agent/bot key wrote the comment. */
  actor_label: string | null;
}

/** POST /api/v1/auth/mobile/token */
export interface MobileTokenResponse {
  api_key: string;
  email: string;
  name: string | null;
}

/** POST /api/v1/projects/{projectId}/tasks body. */
export interface CreateTaskInput {
  title: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  /** "YYYY-MM-DD" (stored as UTC midnight) or null. */
  due_date?: string | null;
  parent_task_id?: string | null;
}

/**
 * PATCH /api/v1/tasks/{taskId} body. Only these fields are accepted; status
 * has its own route (PATCH .../status, `tasks:status` scope).
 */
export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  priority?: TaskPriority;
  due_date?: string | null;
  sort_order?: number;
}

export interface ApiErrorBody {
  error: string;
}
