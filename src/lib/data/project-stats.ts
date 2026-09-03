import "server-only";

import { createClient } from "@/lib/supabase-server";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { getLocalSessionUserId } from "@/lib/auth/local-auth";
import type { ProjectStats } from "@/types/project";

const EMPTY_STATS: ProjectStats = {
  total_tasks: 0,
  completed_tasks: 0,
  in_progress_tasks: 0,
  total_phases: 0,
  completed_phases: 0,
  total_files: 0,
  total_decisions: 0,
  total_memory: 0,
  completion_percentage: 0,
};

/**
 * Overview counters for the project dashboard - aggregated in SQL, not by
 * fetching every task/phase/file/decision/memory row just to .length/.filter()
 * count them in JS. This runs on every visit to a project's own page (the
 * highest-traffic route per project), and unlike a plan's task-per-project
 * cap (NULL/unlimited on Business, and never enforced at all for self-hosted
 * installs - see checkTaskLimit's `if (!hasDirectDatabase())` guard in
 * work/actions.ts), nothing bounds how many rows a project can actually
 * have, so the old row-fetching version pulled an unbounded result set on
 * every load just to produce eight integers.
 *
 * Self-hosted branch resolves identity itself (getLocalSessionUserId())
 * rather than taking a userId parameter - same choice as
 * getSwitchableProjects() in project-access.ts, to keep this call site
 * (src/app/projects/[id]/page.tsx) unchanged. requireProjectAccess() has
 * already gated the request by the time this runs, so an empty session here
 * would mean the caller skipped that gate, not a real anonymous request.
 */
export async function getProjectStats(projectId: string): Promise<ProjectStats> {
  if (hasDirectDatabase()) {
    const userId = await getLocalSessionUserId();
    if (!userId) return EMPTY_STATS;

    // Five withUser() calls, not one wrapping Promise.all([...]) - each
    // checks out its own pooled connection, so this is genuinely concurrent
    // instead of firing multiple queries on one pg client (the deprecated
    // shape, removed in pg@9).
    const [tasksRes, phasesRes, filesRes, decisionsRes, memoryRes] = await Promise.all([
      withUser(userId, ({ query }) =>
        // Subtasks (migration 010) are plain rows in `tasks`, so counting
        // every row would silently double-count work once a task gets
        // subtasks - match the work board's convention
        // (work-board.tsx) and count top-level tasks only. 'done'/'completed'
        // both count as done (isDone's vocabulary, task-board.ts) - reading
        // status = 'completed' alone would silently show 0 completed for
        // every task created after migration 002 renamed the vocabulary.
        query(
          `SELECT
             count(*) FILTER (WHERE parent_task_id IS NULL) AS total,
             count(*) FILTER (WHERE parent_task_id IS NULL AND status IN ('done', 'completed')) AS completed,
             count(*) FILTER (WHERE parent_task_id IS NULL AND status = 'in_progress') AS in_progress
           FROM tasks WHERE project_id = $1`,
          [projectId]
        )
      ),
      withUser(userId, ({ query }) =>
        // roadmap_phases has its own status vocabulary (planned/in_progress/
        // completed/blocked) - 'completed' is correct here, unlike for tasks.
        query(
          `SELECT count(*) AS total, count(*) FILTER (WHERE status = 'completed') AS completed
           FROM roadmap_phases WHERE project_id = $1`,
          [projectId]
        )
      ),
      withUser(userId, ({ query }) =>
        query("SELECT count(*) AS total FROM project_files WHERE project_id = $1", [projectId])
      ),
      withUser(userId, ({ query }) =>
        query("SELECT count(*) AS total FROM context_decisions WHERE project_id = $1", [projectId])
      ),
      withUser(userId, ({ query }) =>
        query("SELECT count(*) AS total FROM project_memory WHERE project_id = $1", [projectId])
      ),
    ]);

    return computeStats({
      totalTasks: Number(tasksRes.rows[0]?.total ?? 0),
      completedTasks: Number(tasksRes.rows[0]?.completed ?? 0),
      inProgressTasks: Number(tasksRes.rows[0]?.in_progress ?? 0),
      totalPhases: Number(phasesRes.rows[0]?.total ?? 0),
      completedPhases: Number(phasesRes.rows[0]?.completed ?? 0),
      totalFiles: Number(filesRes.rows[0]?.total ?? 0),
      totalDecisions: Number(decisionsRes.rows[0]?.total ?? 0),
      totalMemory: Number(memoryRes.rows[0]?.total ?? 0),
    });
  }

  const supabase = await createClient();

  // PostgREST's count: "exact", head: true gives one filtered count per
  // call, not a FILTER-clause equivalent - so tasks/phases need one call per
  // bucket (matching the pattern dashboard/page.tsx already uses) rather
  // than the single grouped query the direct-Postgres branch can run.
  const [
    totalTasksRes,
    completedTasksRes,
    inProgressTasksRes,
    totalPhasesRes,
    completedPhasesRes,
    filesRes,
    decisionsRes,
    memoryRes,
  ] = await Promise.all([
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .is("parent_task_id", null),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .is("parent_task_id", null)
      .in("status", ["done", "completed"]),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .is("parent_task_id", null)
      .eq("status", "in_progress"),
    supabase.from("roadmap_phases").select("id", { count: "exact", head: true }).eq("project_id", projectId),
    supabase
      .from("roadmap_phases")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .eq("status", "completed"),
    supabase.from("project_files").select("id", { count: "exact", head: true }).eq("project_id", projectId),
    supabase.from("context_decisions").select("id", { count: "exact", head: true }).eq("project_id", projectId),
    supabase.from("project_memory").select("id", { count: "exact", head: true }).eq("project_id", projectId),
  ]);

  return computeStats({
    totalTasks: totalTasksRes.count ?? 0,
    completedTasks: completedTasksRes.count ?? 0,
    inProgressTasks: inProgressTasksRes.count ?? 0,
    totalPhases: totalPhasesRes.count ?? 0,
    completedPhases: completedPhasesRes.count ?? 0,
    totalFiles: filesRes.count ?? 0,
    totalDecisions: decisionsRes.count ?? 0,
    totalMemory: memoryRes.count ?? 0,
  });
}

function computeStats(counts: {
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  totalPhases: number;
  completedPhases: number;
  totalFiles: number;
  totalDecisions: number;
  totalMemory: number;
}): ProjectStats {
  return {
    total_tasks: counts.totalTasks,
    completed_tasks: counts.completedTasks,
    in_progress_tasks: counts.inProgressTasks,
    total_phases: counts.totalPhases,
    completed_phases: counts.completedPhases,
    total_files: counts.totalFiles,
    total_decisions: counts.totalDecisions,
    total_memory: counts.totalMemory,
    completion_percentage:
      counts.totalTasks > 0 ? Math.round((counts.completedTasks / counts.totalTasks) * 100) : 0,
  };
}
