"use server";

/**
 * "Why" context for a single task - TODO.md §20 ("a record should be able to
 * answer: where did this information come from?") applied to the task detail
 * dialog specifically.
 *
 * Two things are surfaced:
 *   1. The task's directly-linked decision, via tasks.decision_id.
 *   2. Everything connected through context_relations where the task is
 *      either the source or the target - grouped by relation_type in the UI,
 *      resolved here against whichever table source_type/target_type points
 *      at (context_decisions / context_sources / project_memory /
 *      roadmap_phases / project_files / tasks / projects).
 *
 * Called lazily as a Server Action from TaskDetailDialog when the dialog
 * opens (src/components/work/task-detail-dialog.tsx), the same pattern
 * loadComments already uses (src/app/projects/[id]/work/actions.ts) - not
 * prefetched for every task on the board, since most tasks are never opened.
 *
 * Attribution: creator ids returned here (createdBy) are resolved against
 * `members` on the client, exactly like comment authors already are
 * (TaskDetailDialog's `membersById`) - every entity a project member could
 * have created satisfies project_role(project_id) on insert, so the
 * project's member list is a complete lookup table. context_sources.author
 * is a free-text field with no profile FK (see types/context.ts), so it is
 * returned separately as createdByText rather than an id to resolve.
 */

import { createClient } from "@/lib/supabase-server";
import { getProjectAccess } from "@/lib/data/project-access";
import { buildTaskWhyContext, type TaskWhyContext } from "@/lib/context/task-why-builder";

// Type-only re-exports (erased at build time, so allowed in a "use server"
// file) keep every existing `import { type TaskWhyContext } from
// "@/lib/context/task-why"` working. The session-free builder itself lives in
// task-why-builder.ts and must NOT be exported from here - see the comment there.
export type { TaskWhyContext, TaskWhyDecision, TaskWhyRelatedItem } from "@/lib/context/task-why-builder";

export async function getTaskWhyContext(projectId: string, taskId: string): Promise<TaskWhyContext> {
  const access = await getProjectAccess(projectId);
  if (!access) return { decision: null, related: [], error: "You do not have access to this project." };

  return buildTaskWhyContext(access.userId, projectId, taskId, () => createClient());
}
