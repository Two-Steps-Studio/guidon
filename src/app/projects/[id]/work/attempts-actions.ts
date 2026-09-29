"use server";

// Previous attempts (TODO.md §22, migration 013) - split out of actions.ts.

import { revalidatePath } from "next/cache";
import { canManageProject, canWriteProject, getProjectAccess } from "@/lib/data/project-access";
import { dataClient } from "@/lib/data-client";
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

  const { data, error } = await dataClient(access.userId)
    .from<TaskAttempt>("task_attempts")
    .select(ATTEMPT_COLUMNS)
    .eq("task_id", taskId)
    .order("created_at", { ascending: false });

  if (error) return { attempts: [], error: error.message };
  return { attempts: data, error: null };
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

  const { data, error } = await dataClient(access.userId)
    .from("task_attempts")
    .insert({ ...values, created_by: access.userId })
    .select<TaskAttempt>(ATTEMPT_COLUMNS)
    .single();

  if (error || !data) return { attempt: null, error: error?.message ?? "Failed to record attempt." };

  revalidatePath(`/projects/${projectId}/work`);
  return { attempt: data, error: null };
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

  // task_attempts has no project_id column - ownership is derived through
  // the attempt's task. Resolve that first and verify the task belongs to
  // projectId, then delete scoped to both the attempt and that task, so a
  // cross-project attemptId can't be deleted by id alone and trusting RLS.
  const db = dataClient(access.userId);
  const { data: attempt, error: lookupError } = await db
    .from<{ task_id: string }>("task_attempts")
    .select("task_id")
    .eq("id", attemptId)
    .maybeSingle();
  if (lookupError) return { error: lookupError.message };

  const { data: task, error: taskError } = attempt
    ? await db.from<{ id: string }>("tasks").select("id").eq("id", attempt.task_id).eq("project_id", projectId).maybeSingle()
    : { data: null, error: null };
  if (taskError) return { error: taskError.message };
  if (!attempt || !task) return { error: "This attempt could not be found in this project." };

  // Row-count checked: an RLS-filtered DELETE succeeds with zero rows.
  const { data: deleted, error } = await db
    .from("task_attempts")
    .delete()
    .eq("id", attemptId)
    .eq("task_id", attempt.task_id)
    .select("id");

  if (error) return { error: error.message };
  if (deleted.length === 0) return { error: "This attempt could not be found in this project." };

  revalidatePath(`/projects/${projectId}/work`);
  return { error: null };
}
