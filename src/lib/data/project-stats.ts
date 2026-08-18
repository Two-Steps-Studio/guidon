import "server-only";

import { createClient } from "@/lib/supabase-server";
import { isDone } from "@/lib/work/task-board";
import type { ProjectStats } from "@/types/project";

/**
 * Overview counters for the project dashboard.
 *
 * Five independent counts, so they run as one Promise.all round trip rather
 * than five sequential ones — the client-side version this replaced awaited
 * them one at a time inside a single fetch function, but that was an artifact
 * of them all being destructured from one Promise.all already; the only real
 * change here is running under RLS as the signed-in user via the server
 * client instead of the browser one.
 */
export async function getProjectStats(projectId: string): Promise<ProjectStats> {
  const supabase = await createClient();

  const [tasksRes, phasesRes, filesRes, decisionsRes, memoryRes] = await Promise.all([
    supabase.from("tasks").select("id, status").eq("project_id", projectId),
    supabase.from("roadmap_phases").select("id, status").eq("project_id", projectId),
    supabase.from("project_files").select("id").eq("project_id", projectId),
    supabase.from("context_decisions").select("id").eq("project_id", projectId),
    supabase.from("project_memory").select("id").eq("project_id", projectId),
  ]);

  const tasks = tasksRes.data ?? [];
  const phases = phasesRes.data ?? [];

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
    total_files: filesRes.data?.length ?? 0,
    total_decisions: decisionsRes.data?.length ?? 0,
    total_memory: memoryRes.data?.length ?? 0,
    completion_percentage:
      totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
  };
}
