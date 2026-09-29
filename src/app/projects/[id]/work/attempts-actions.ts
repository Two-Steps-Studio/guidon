"use server";

// Previous attempts (TODO.md §22, migration 013) - split out of actions.ts.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { canManageProject, canWriteProject, getProjectAccess } from "@/lib/data/project-access";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { isSafeHttpUrl } from "@/lib/validation/url";
import type { AttemptOutcome, TaskAttempt } from "@/types/task";
import type { TaskMutationResult } from "./actions";

// ============================================================
// PREVIOUS ATTEMPTS (TODO.md §22, migration 013)
// ============================================================

const ATTEMPT_COLUMNS =
  "id, task_id, problem, approach, outcome, result, failure_reason, files_changed, related_pr_url, agent, created_by, created_at";

export async function loadAttempts(
  projectId: string,
  taskId: string
): Promise<{ attempts: TaskAttempt[]; error: string | null }> {
  const access = await getProjectAccess(projectId);
  if (!access) return { attempts: [], error: "You do not have access to this project." };

  if (hasDirectDatabase()) {
    try {
      const result = await withUser(access.userId, ({ query }) =>
        query(
          `SELECT ${ATTEMPT_COLUMNS} FROM task_attempts WHERE task_id = $1 ORDER BY created_at DESC`,
          [taskId]
        )
      );
      return { attempts: result.rows, error: null };
    } catch (error) {
      return { attempts: [], error: error instanceof Error ? error.message : "Failed to load attempts." };
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("task_attempts")
    .select(ATTEMPT_COLUMNS)
    .eq("task_id", taskId)
    .order("created_at", { ascending: false });

  if (error) return { attempts: [], error: error.message };
  return { attempts: (data ?? []) as unknown as TaskAttempt[], error: null };
}

export async function createAttempt(
  projectId: string,
  input: {
    task_id: string;
    problem: string;
    approach: string;
    outcome: AttemptOutcome;
    result: string;
    failure_reason: string;
    files_changed: string;
    related_pr_url: string;
    agent: string;
  }
): Promise<{ attempt: TaskAttempt | null; error: string | null }> {
  const access = await getProjectAccess(projectId);
  // Mirrors task_attempts_insert (013): owner/admin/developer - not tester,
  // recording an implementation attempt is developer-tier work.
  if (!access || !canWriteProject(access.role)) {
    return { attempt: null, error: "You do not have permission to record an attempt." };
  }
  if (!input.problem.trim() || !input.approach.trim()) {
    return { attempt: null, error: "Problem and approach are required." };
  }

  const trimmedPrUrl = input.related_pr_url.trim();
  // task-attempts-section.tsx renders this straight into an <a href> for
  // every project member - a javascript:/data: URI would otherwise store
  // and later execute in a teammate's session on click. See url.ts's
  // own comment for the full reasoning.
  if (trimmedPrUrl && !isSafeHttpUrl(trimmedPrUrl)) {
    return { attempt: null, error: "PR link must be a valid http(s) URL." };
  }

  const filesChanged = input.files_changed
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const values = {
    task_id: input.task_id,
    problem: input.problem.trim(),
    approach: input.approach.trim(),
    outcome: input.outcome,
    result: input.result.trim() || null,
    failure_reason: input.failure_reason.trim() || null,
    files_changed: filesChanged,
    related_pr_url: trimmedPrUrl || null,
    agent: input.agent.trim() || null,
  };

  if (hasDirectDatabase()) {
    try {
      const result = await withUser(access.userId, ({ query }) =>
        query(
          `INSERT INTO task_attempts
             (task_id, problem, approach, outcome, result, failure_reason, files_changed, related_pr_url, agent, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING ${ATTEMPT_COLUMNS}`,
          [
            values.task_id,
            values.problem,
            values.approach,
            values.outcome,
            values.result,
            values.failure_reason,
            values.files_changed,
            values.related_pr_url,
            values.agent,
            access.userId,
          ]
        )
      );
      revalidatePath(`/projects/${projectId}/work`);
      return { attempt: result.rows[0] as TaskAttempt, error: null };
    } catch (error) {
      return { attempt: null, error: error instanceof Error ? error.message : "Failed to record attempt." };
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("task_attempts")
    .insert({ ...values, created_by: access.userId })
    .select(ATTEMPT_COLUMNS)
    .single();

  if (error) return { attempt: null, error: error.message };

  revalidatePath(`/projects/${projectId}/work`);
  return { attempt: data as unknown as TaskAttempt, error: null };
}

export async function deleteAttempt(
  projectId: string,
  attemptId: string
): Promise<TaskMutationResult> {
  const access = await getProjectAccess(projectId);
  // Mirrors task_attempts_delete (013): owner/admin only.
  if (!access || !canManageProject(access.role)) {
    return { error: "You do not have permission to delete this attempt." };
  }

  if (hasDirectDatabase()) {
    try {
      const result = await withUser(access.userId, ({ query }) =>
        query(
          `DELETE FROM task_attempts
           WHERE id = $1
             AND task_id IN (SELECT id FROM tasks WHERE project_id = $2)
           RETURNING id`,
          [attemptId, projectId]
        )
      );
      if (result.rows.length === 0) {
        return { error: "This attempt could not be found in this project." };
      }
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Failed to delete attempt." };
    }

    revalidatePath(`/projects/${projectId}/work`);
    return { error: null };
  }

  const supabase = await createClient();

  // task_attempts has no project_id column - ownership is only derivable by
  // joining through tasks, and Supabase's delete builder can't filter by a
  // joined table's column, so this verifies the attempt's task belongs to
  // projectId before deleting rather than deleting by id alone and trusting
  // RLS to have silently no-op'd on a cross-project id.
  const { data: owning, error: lookupError } = await supabase
    .from("task_attempts")
    .select("id, task_id, tasks!inner(project_id)")
    .eq("id", attemptId)
    .eq("tasks.project_id", projectId)
    .maybeSingle();

  if (lookupError) return { error: lookupError.message };
  if (!owning) return { error: "This attempt could not be found in this project." };

  // Row-count checked like every other mutation here: an RLS-filtered
  // DELETE succeeds with zero rows, which must not come back as success.
  const { data: deleted, error } = await supabase
    .from("task_attempts")
    .delete()
    .eq("id", attemptId)
    .eq("task_id", owning.task_id)
    .select("id");

  if (error) return { error: error.message };
  if (!deleted || deleted.length === 0) return { error: "This attempt could not be found in this project." };

  revalidatePath(`/projects/${projectId}/work`);
  return { error: null };
}
