"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { canManageProject, getProjectAccess } from "@/lib/data/project-access";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { BOARD_COLUMNS } from "@/lib/work/task-board";
import type { TaskStatus } from "@/types/task";

export interface BoardColumnInput {
  status: TaskStatus;
  label: string;
  sort_order: number;
  hidden: boolean;
}

export type BoardColumnsState = { error: string | null };

const VALID_STATUSES = new Set(BOARD_COLUMNS.map((c) => c.status));

export async function updateBoardColumns(
  projectId: string,
  columns: BoardColumnInput[]
): Promise<BoardColumnsState> {
  const access = await getProjectAccess(projectId);
  if (!access || !canManageProject(access.role)) {
    return { error: "You do not have permission to change this project's board layout." };
  }

  if (columns.length !== BOARD_COLUMNS.length || columns.some((c) => !VALID_STATUSES.has(c.status))) {
    return { error: "Invalid column payload." };
  }
  if (columns.every((c) => c.hidden)) {
    return { error: "At least one column must stay visible." };
  }

  const hiddenStatuses = columns.filter((c) => c.hidden).map((c) => c.status);

  if (hasDirectDatabase()) {
    try {
      await withUser(access.userId, async ({ query }) => {
        if (hiddenStatuses.length > 0) {
          const occupied = await query(
            "SELECT DISTINCT status FROM tasks WHERE project_id = $1 AND status = ANY($2::text[])",
            [projectId, hiddenStatuses]
          );
          if (occupied.rows.length > 0) {
            throw new Error(
              `Move tasks out of "${occupied.rows[0].status}" before hiding that column.`
            );
          }
        }

        for (const column of columns) {
          const label = column.label.trim() || null;
          await query(
            `INSERT INTO project_board_columns (project_id, status, label, sort_order, hidden, updated_at)
             VALUES ($1, $2, $3, $4, $5, now())
             ON CONFLICT (project_id, status) DO UPDATE SET
               label = EXCLUDED.label,
               sort_order = EXCLUDED.sort_order,
               hidden = EXCLUDED.hidden,
               updated_at = now()`,
            [projectId, column.status, label, column.sort_order, column.hidden]
          );
        }
      });
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Failed to update board columns." };
    }
  } else {
    const supabase = await createClient();

    if (hiddenStatuses.length > 0) {
      const { data: occupied, error: occupiedError } = await supabase
        .from("tasks")
        .select("status")
        .eq("project_id", projectId)
        .in("status", hiddenStatuses)
        .limit(1);
      if (occupiedError) return { error: occupiedError.message };
      if (occupied && occupied.length > 0) {
        return { error: `Move tasks out of "${occupied[0].status}" before hiding that column.` };
      }
    }

    const { error } = await supabase.from("project_board_columns").upsert(
      columns.map((column) => ({
        project_id: projectId,
        status: column.status,
        label: column.label.trim() || null,
        sort_order: column.sort_order,
        hidden: column.hidden,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "project_id,status" }
    );
    if (error) return { error: error.message };
  }

  revalidatePath(`/projects/${projectId}/settings`);
  revalidatePath(`/projects/${projectId}/work`);
  return { error: null };
}
