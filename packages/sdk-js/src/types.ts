/**
 * Types of the Guidon REST API (/api/v1), mirroring the OpenAPI document the
 * server publishes at /openapi.json (src/lib/api/openapi.ts in the Guidon
 * repository). Rows carry an index signature because the server returns whole
 * database rows and may add columns without a new API version.
 */

/** Built-in column keys. Projects can add their own (GET /projects/{id}/columns). */
export type BuiltInTaskStatus = "backlog" | "todo" | "in_progress" | "ai_working" | "review" | "done";
export type TaskStatus = BuiltInTaskStatus | (string & {});

/** Built-in priority keys. Projects can add their own (GET /projects/{id}/priorities). */
export type BuiltInTaskPriority = "low" | "medium" | "high" | "critical";
export type TaskPriority = BuiltInTaskPriority | (string & {});

export interface Project {
  id: string;
  name: string;
  organization_id: string;
  [key: string]: unknown;
}

export interface Task {
  id: string;
  project_id: string;
  parent_task_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  /** In done or a column the project marks as done. */
  is_done?: boolean;
  tags: string[];
  assignee_id: string | null;
  due_date: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface Column {
  status: TaskStatus;
  label: string;
  /** Tasks in this column count as finished. */
  is_done: boolean;
  /** A column the project added, not a built-in one. */
  custom: boolean;
  color: string | null;
  [key: string]: unknown;
}

export interface Priority {
  key: TaskPriority;
  label: string;
  custom: boolean;
  color: string | null;
  [key: string]: unknown;
}

export interface Reference {
  id: string;
  name: string;
  size_bytes: number | null;
  mime_type: string | null;
  caption: string | null;
  tags: string[];
  source_url: string | null;
  created_at: string;
  /** Short-lived signed URL of the image. */
  image_url: string | null;
  [key: string]: unknown;
}

export interface Comment {
  id: string;
  task_id: string;
  author_id: string | null;
  content: string;
  created_at: string;
  actor_label?: string | null;
  [key: string]: unknown;
}

export type AttemptOutcome = "failed" | "partial" | "succeeded";

export interface Attempt {
  id: string;
  task_id: string;
  problem: string;
  approach: string;
  outcome: AttemptOutcome;
  result: string | null;
  failure_reason: string | null;
  files_changed: string[] | null;
  related_pr_url: string | null;
  agent: string | null;
  created_by: string | null;
  created_at: string;
  [key: string]: unknown;
}

// ------------------------------------------------------------------ inputs

export interface CreateTaskInput {
  /** Required, non-empty. */
  title: string;
  description?: string;
  /** Defaults to `medium`. Ignored for subtasks (always `medium`). */
  priority?: TaskPriority;
  /** Column to create the task in. Defaults to `backlog`. Ignored for subtasks (always `todo`). */
  status?: TaskStatus;
  /** ISO 8601 date/time. */
  due_date?: string;
  /** UUID of a parent task in the same project, to create a subtask. */
  parent_task_id?: string;
}

export interface UpdateTaskInput {
  title?: string;
  /** `null` or `""` clears it. */
  description?: string | null;
  priority?: TaskPriority;
  /** ISO 8601 date/time; `null` or `""` clears it. */
  due_date?: string | null;
  /** Position of the card within its column. */
  sort_order?: number;
}

export interface CreateSubtaskInput {
  title: string;
  description?: string;
  due_date?: string;
}

export interface RecordAttemptInput {
  problem: string;
  approach: string;
  outcome: AttemptOutcome;
  result?: string;
  failure_reason?: string;
  agent?: string;
  /** http(s) URL of the related pull request. */
  related_pr_url?: string;
  files_changed?: string[];
}

export type ReportCategory = "bug" | "crash" | "feedback";
export type ReportSource = "game" | "web";

export interface ReportFile {
  /** File contents. */
  data: Blob | ArrayBuffer | Uint8Array | string;
  name: string;
  /** MIME type, e.g. `image/png`. */
  type?: string;
}

export interface FileReportInput {
  title: string;
  description?: string;
  category?: ReportCategory;
  source?: ReportSource;
  reporter?: string;
  /** Flat key/value pairs (version, platform, ...), sent as a JSON string. */
  metadata?: Record<string, string | number | boolean | null>;
  files?: ReportFile[];
}

export interface FileReportResult {
  task: Task;
  attachments: Array<Record<string, unknown>>;
  warnings: string[];
}

// -------------------------------------------------- project knowledge rows

export type DecisionStatus = "proposed" | "approved" | "rejected" | "deprecated";
export type DecisionType = "technical" | "architectural" | "product" | "business" | "process" | "other";

export interface Decision {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  impact: string | null;
  alternatives: string[] | null;
  status: DecisionStatus;
  decision_type: DecisionType;
  created_at: string;
  [key: string]: unknown;
}

export interface DecisionInput {
  title: string;
  description?: string;
  impact?: string;
  alternatives?: string[];
  status?: DecisionStatus;
  decision_type?: DecisionType;
}

export type DecisionPatch = Partial<Omit<DecisionInput, "description" | "impact">> & {
  description?: string | null;
  impact?: string | null;
};

export type KnowledgeSourceType =
  | "document"
  | "comment"
  | "commit"
  | "pull_request"
  | "issue"
  | "external_url"
  | "meeting"
  | "file"
  | "other";

export interface KnowledgeSource {
  id: string;
  project_id: string;
  title: string;
  source_type: KnowledgeSourceType;
  content: string | null;
  url: string | null;
  created_at: string;
  [key: string]: unknown;
}

export interface KnowledgeSourceInput {
  title: string;
  source_type?: KnowledgeSourceType;
  content?: string;
  url?: string;
}

export type KnowledgeSourcePatch = Partial<Omit<KnowledgeSourceInput, "content" | "url">> & {
  content?: string | null;
  url?: string | null;
};

export type RoadmapPhaseStatus = "planned" | "in_progress" | "completed" | "blocked";

export interface RoadmapPhase {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  status: RoadmapPhaseStatus;
  start_date: string | null;
  planned_end_date: string | null;
  actual_end_date: string | null;
  completion_percentage: number | null;
  sort_order: number | null;
  created_at: string;
  [key: string]: unknown;
}

export interface RoadmapPhaseInput {
  name: string;
  description?: string;
  status?: RoadmapPhaseStatus;
  /** ISO 8601 date. */
  start_date?: string;
  planned_end_date?: string;
  actual_end_date?: string;
  /** 0-100. */
  completion_percentage?: number;
  sort_order?: number;
}

export type RoadmapPhasePatch = {
  name?: string;
  status?: RoadmapPhaseStatus;
  completion_percentage?: number;
  description?: string | null;
  start_date?: string | null;
  planned_end_date?: string | null;
  actual_end_date?: string | null;
  sort_order?: number | null;
};

export type MemoryType =
  | "fact"
  | "project_rule"
  | "constraint"
  | "preference"
  | "decision_summary"
  | "observation"
  | "ai_insight";

export interface MemoryEntry {
  id: string;
  project_id: string;
  content: string;
  memory_type: MemoryType;
  confidence: number | null;
  verified: boolean;
  created_at: string;
  [key: string]: unknown;
}

export interface MemoryInput {
  content: string;
  memory_type?: MemoryType;
  /** 0-1. */
  confidence?: number;
}

export type MemoryPatch = {
  content?: string;
  memory_type?: MemoryType;
  confidence?: number | null;
};

export type TechnologyCategory = "frontend" | "backend" | "game_engine" | "database" | "devops" | "ai" | "other";

export interface Technology {
  id: string;
  project_id: string;
  name: string;
  version: string | null;
  category: TechnologyCategory;
  description: string | null;
  icon_slug: string | null;
  sort_order: number | null;
  [key: string]: unknown;
}

export interface TechnologyInput {
  name: string;
  version?: string;
  category?: TechnologyCategory;
  description?: string;
  /** Simple Icons slug, e.g. `unity`. */
  icon_slug?: string;
  sort_order?: number;
}

export type TechnologyPatch = {
  name?: string;
  category?: TechnologyCategory;
  version?: string | null;
  description?: string | null;
  icon_slug?: string | null;
  sort_order?: number | null;
};

/** GET /me - who the token acts as. */
export interface Me {
  user: { id: string; email: string | null; name: string | null };
  token: { scopes: string[]; project_id: string | null; human_client: boolean };
}
