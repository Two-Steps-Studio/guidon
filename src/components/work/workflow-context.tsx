"use client";

import { createContext, useContext } from "react";
import { BOARD_COLUMNS, resolvePriorities, type BoardColumn, type PriorityDef } from "@/lib/work/task-board";

/**
 * The project's board columns and priorities (migrations 020/060: built-ins,
 * possibly relabelled, plus its own) for the work UI - a context for the
 * same reason as LabelPresetsContext. Pages that show tasks (board,
 * calendar, the desktop mini window) provide it; outside a provider it's
 * the built-in columns and priorities.
 */
export interface Workflow {
  columns: readonly BoardColumn[];
  priorities: readonly PriorityDef[];
}

const WorkflowContext = createContext<Workflow>({ columns: BOARD_COLUMNS, priorities: resolvePriorities([]) });

export const WorkflowProvider = WorkflowContext.Provider;

export function useWorkflow(): Workflow {
  return useContext(WorkflowContext);
}

export function usePriorities(): readonly PriorityDef[] {
  return useContext(WorkflowContext).priorities;
}
