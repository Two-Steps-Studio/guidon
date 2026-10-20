import "server-only";

import { dataClient, type DataClient } from "@/lib/data-client";
import type { BoardColumnOverride, PriorityOverride } from "@/lib/work/task-board";

/**
 * A project's saved board columns and priorities (migrations 020/060) - one
 * loader for every page, API route and webhook instead of the same SELECT
 * written in each. Resolve with resolveBoardColumns / resolvePriorities.
 * `client` defaults to the user's RLS-scoped data client; API-key routes
 * pass their own.
 */
export const COLUMN_OVERRIDE_FIELDS = "status, label, sort_order, hidden, is_done, color";
export const PRIORITY_OVERRIDE_FIELDS = "key, label, color, rank, hidden";

export interface WorkflowOverrides {
  columns: BoardColumnOverride[];
  priorities: PriorityOverride[];
}

export async function getWorkflowOverrides(userId: string, projectId: string, client?: DataClient): Promise<WorkflowOverrides> {
  const map = await getWorkflowOverridesFor(userId, [projectId], client);
  return map.get(projectId) ?? { columns: [], priorities: [] };
}

/** Several projects at once (My tasks, the dashboard). */
export async function getWorkflowOverridesFor(
  userId: string,
  projectIds: string[],
  client?: DataClient
): Promise<Map<string, WorkflowOverrides>> {
  const result = new Map<string, WorkflowOverrides>(projectIds.map((id) => [id, { columns: [], priorities: [] }]));
  if (!projectIds.length) return result;
  const db = client ?? dataClient(userId);
  const [columns, priorities] = await Promise.all([
    db
      .from<BoardColumnOverride & { project_id: string }>("project_board_columns")
      .select(`project_id, ${COLUMN_OVERRIDE_FIELDS}`)
      .in("project_id", projectIds),
    db
      .from<PriorityOverride & { project_id: string }>("project_task_priorities")
      .select(`project_id, ${PRIORITY_OVERRIDE_FIELDS}`)
      .in("project_id", projectIds),
  ]);
  if (columns.error) throw new Error(`Failed to load board columns: ${columns.error.message}`);
  if (priorities.error) throw new Error(`Failed to load priorities: ${priorities.error.message}`);
  for (const { project_id, ...row } of columns.data ?? []) result.get(project_id)?.columns.push(row);
  for (const { project_id, ...row } of priorities.data ?? []) result.get(project_id)?.priorities.push(row);
  return result;
}
