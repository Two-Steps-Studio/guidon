// ============================================
// TASK TYPE DEFINITIONS
// ============================================

export type TaskStatus = "todo" | "in_progress" | "testing" | "completed";
export type TaskPriority = "low" | "medium" | "high" | "critical";

export interface Task {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  tags: string[];
  due_date: string | null;
  progress_percent: number;
  assignee_id: string | null;
  estimated_hours: number | null;
  actual_hours: number | null;
  sort_order: number | null;
  decision_id: string | null; // Link to decision
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CreateTaskData {
  project_id: string;
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  tags?: string[];
  due_date?: string;
  progress_percent?: number;
  assignee_id?: string;
  estimated_hours?: number;
  sort_order?: number;
  decision_id?: string;
}

export interface UpdateTaskData {
  id: string;
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  tags?: string[];
  due_date?: string;
  progress_percent?: number;
  assignee_id?: string;
  estimated_hours?: number;
  actual_hours?: number;
  sort_order?: number;
  decision_id?: string;
}

// ============================================
// ROADMAP PHASE TYPES
// ============================================

export type PhaseStatus = "planned" | "in_progress" | "completed" | "blocked";

export interface RoadmapPhase {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  start_date: string | null;
  planned_end_date: string | null;
  actual_end_date: string | null;
  status: PhaseStatus;
  completion_percentage: number;
  sort_order: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CreatePhaseData {
  project_id: string;
  name: string;
  description?: string;
  start_date?: string;
  planned_end_date?: string;
  status?: PhaseStatus;
  completion_percentage?: number;
  sort_order?: number;
}

export interface UpdatePhaseData {
  name?: string;
  description?: string;
  start_date?: string;
  planned_end_date?: string;
  actual_end_date?: string;
  status?: PhaseStatus;
  completion_percentage?: number;
  sort_order?: number;
}

// ============================================
// TASK COMMENT TYPES
// ============================================

export interface TaskComment {
  id: string;
  task_id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface CreateCommentData {
  task_id: string;
  content: string;
}

export interface UpdateCommentData {
  content: string;
}
