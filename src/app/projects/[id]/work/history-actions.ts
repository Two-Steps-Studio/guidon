"use server";

import { getProjectAccess } from "@/lib/data/project-access";
import { dataClient } from "@/lib/data-client";
import { tr } from "@/lib/i18n/server-errors";

/**
 * One change to a task, from the Context Engine log (migration 090): the
 * triggers on `tasks` record who changed it, when, which fields and the
 * status before/after - names of fields only, never their content, so the
 * history can't leak a description or a secret pasted into one.
 */
export interface TaskHistoryEntry {
  id: string;
  event_type: string;
  actor_id: string | null;
  occurred_at: string;
  payload: { fields?: string[]; from?: string; to?: string; status?: string; backfilled?: boolean };
}

export async function loadTaskHistory(
  projectId: string,
  taskId: string
): Promise<{ entries: TaskHistoryEntry[]; error: string | null }> {
  const access = await getProjectAccess(projectId);
  if (!access) return { entries: [], error: await tr("You do not have access to this project.") };

  // RLS (context_events_select) re-checks project access; project_id keeps
  // a task id from another project out even for someone who can see both.
  const { data, error } = await dataClient(access.userId)
    .from<TaskHistoryEntry>("context_events")
    .select("id, event_type, actor_id, occurred_at, payload")
    .eq("project_id", projectId)
    .eq("entity_type", "task")
    .eq("entity_id", taskId)
    .order("occurred_at", { ascending: false })
    .limit(50);

  if (error) return { entries: [], error: error.message };
  return { entries: data, error: null };
}
