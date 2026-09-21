-- Migration 037: Performance optimizations for project views and task lists.
-- Goal: Reduce TTFB for project boards and task lists by optimizing index lookups.

-- 1. Index for the most common project task view: filtering by project and ordering by created_at or sort_order.
CREATE INDEX IF NOT EXISTS idx_tasks_project_created_at ON tasks (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_project_sort_order ON tasks (project_id, sort_order ASC);

-- 2. Index for project memory to speed up context gathering for AI.
CREATE INDEX IF NOT EXISTS idx_project_memory_project_type ON project_memory (project_id, memory_type);

-- 3. Index for context relations to speed up the 'Why' panel and AI resource fetching.
CREATE INDEX IF NOT EXISTS idx_context_relations_entities ON context_relations (project_id, source_id, target_id);

-- 4. Index for task attempts to speed up history loading.
CREATE INDEX IF NOT EXISTS idx_task_attempts_task_created ON task_attempts (task_id, created_at DESC);
