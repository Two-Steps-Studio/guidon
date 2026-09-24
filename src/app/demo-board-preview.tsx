"use client";

import { KanbanBoard } from "@/components/work/kanban-board";
import { DEMO_TASKS, DEMO_MEMBERS, DEMO_COLUMNS } from "./demo-board-data";

/**
 * Wraps KanbanBoard in a client component so page.tsx (a Server Component)
 * can render it without passing function props across the server/client
 * boundary - Server Components can't pass inline callbacks to a Client
 * Component directly, functions aren't serializable that way.
 *
 * canEdit=false disables drag-and-drop and the per-column "+" button
 * (see kanban-board.tsx's own canEdit gating), so the only interaction left
 * is opening a card, which onOpenTask below intentionally no-ops - there's
 * no real TaskDetailDialog wired up here, and this is a visual preview for
 * a visitor who hasn't signed up yet, not a working board.
 */
export function DemoBoardPreview() {
  return (
    <KanbanBoard
      tasks={DEMO_TASKS}
      members={DEMO_MEMBERS}
      columns={DEMO_COLUMNS}
      canEdit={false}
      onOpenTask={() => {}}
      onCreateTask={() => {}}
      onMoveTask={() => {}}
    />
  );
}
