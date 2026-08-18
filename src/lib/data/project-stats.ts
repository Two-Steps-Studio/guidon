import "server-only";

import { createClient } from "@/lib/supabase-server";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { getLocalSessionUserId } from "@/lib/auth/local-auth";
import { isDone } from "@/lib/work/task-board";
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
 * Overview counters for the project dashboard.
 *
 * Five independent counts, so they run as one Promise.all round trip rather
 * than five sequential ones — the client-side version this replaced awaited
 * them one at a time inside a single fetch function, but that was an artifact
 * of them all being destructured from one Promise.all already; the only real
 * change here is running under RLS as the signed-in user via the server
 * client instead of the browser one.
 *
 * Self-hosted branch resolves identity itself (getLocalSessionUserId())
 * rather than taking a userId parameter — same choice as
 * getSwitchableProjects() in project-access.ts, to keep this call site
 * (src/app/projects/[id]/page.tsx) unchanged. requireProjectAccess() has
 * already gated the request by the time this runs, so an empty session here
 * would mean the caller skipped that gate, not a real anonymous request.
 */
export async function getProjectStats(projectId: string): Promise<ProjectStats> {
  if (hasDirectDatabase()) {
    const userId = await getLocalSessionUserId();
    if (!userId) return EMPTY_STATS;

    const [tasksRes, phasesRes, filesRes, decisionsRes, memoryRes] = await withUser(
      userId,
      ({ query }) =>
        Promise.all([
          query("SELECT id, status, parent_task_id FROM tasks WHERE project_id = $1", [projectId]),
          query("SELECT id, status FROM roadmap_phases WHERE project_id = $1", [projectId]),
          query("SELECT id FROM project_files WHERE project_id = $1", [projectId]),
          query("SELECT id FROM context_decisions WHERE project_id = $1", [projectId]),
          query("SELECT id FROM project_memory WHERE project_id = $1", [projectId]),
        ])
    );

    return computeStats(
      tasksRes.rows,
      phasesRes.rows,
      filesRes.rows.length,
      decisionsRes.rows.length,
      memoryRes.rows.length
    );
  }

  const supabase = await createClient();

  const [tasksRes, phasesRes, filesRes, decisionsRes, memoryRes] = await Promise.all([
    supabase.from("tasks").select("id, status, parent_task_id").eq("project_id", projectId),
    supabase.from("roadmap_phases").select("id, status").eq("project_id", projectId),
    supabase.from("project_files").select("id").eq("project_id", projectId),
    supabase.from("context_decisions").select("id").eq("project_id", projectId),
    supabase.from("project_memory").select("id").eq("project_id", projectId),
  ]);

  return computeStats(
    tasksRes.data ?? [],
    phasesRes.data ?? [],
    filesRes.data?.length ?? 0,
    decisionsRes.data?.length ?? 0,
    memoryRes.data?.length ?? 0
  );
}

function computeStats(
  tasksRaw: { status: string; parent_task_id: string | null }[],
  phasesRaw: { status: string }[],
  totalFiles: number,
  totalDecisions: number,
  totalMemory: number
): ProjectStats {
  // Subtasks (migration 010) are plain rows in `tasks`, so counting every row
  // would silently double-count work once a task gets subtasks: the parent
  // and its children are the same unit of work on the board. Match the work
  // board's convention (src/app/projects/[id]/work/work-board.tsx) and count
  // top-level tasks only.
  const tasks = tasksRaw.filter((t) => !t.parent_task_id);
  const phases = phasesRaw;

  const totalTasks = tasks.length;
  // isDone folds the legacy 'completed' status onto 'done' (see
  // src/lib/work/task-board.ts) — reading task.status === 'completed'
  // directly here would silently show 0 for every task created after
  // migration 002 renamed the vocabulary.
  const completedTasks = tasks.filter((t) => isDone(t.status)).length;
  const inProgressTasks = tasks.filter((t) => t.status === "in_progress").length;

  const totalPhases = phases.length;
  // roadmap_phases has its own status vocabulary (planned/in_progress/
  // completed/blocked) — 'completed' is correct here, unlike for tasks.
  const completedPhases = phases.filter((p) => p.status === "completed").length;

  return {
    total_tasks: totalTasks,
    completed_tasks: completedTasks,
    in_progress_tasks: inProgressTasks,
    total_phases: totalPhases,
    completed_phases: completedPhases,
    total_files: totalFiles,
    total_decisions: totalDecisions,
    total_memory: totalMemory,
    completion_percentage:
      totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
  };
}
