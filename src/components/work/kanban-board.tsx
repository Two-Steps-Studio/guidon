"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  BOARD_COLUMNS,
  compareTasksByDueDate,
  groupTasksByStatus,
  normalizeTaskStatus,
  sortOrderForPosition,
  type BoardColumn,
  type SubtaskProgress,
} from "@/lib/work/task-board";
import { TaskCard, type TaskCardMember } from "@/components/work/task-card";
import type { Task, TaskStatus } from "@/types/task";

interface KanbanBoardProps {
  tasks: Task[];
  members: TaskCardMember[];
  commentCounts?: Record<string, number>;
  /** Signed URL of each task's most recently uploaded image attachment, if any - see work/page.tsx's loadCoverImages. */
  coverImages?: Record<string, string>;
  subtaskCounts?: Record<string, SubtaskProgress>;
  /** The project's resolved (default + overrides) column set - see resolveBoardColumns(). */
  columns?: readonly BoardColumn[];
  /** When false the board is read-only (viewer/tester roles). */
  canEdit: boolean;
  /**
   * "due_date" re-sorts every column by nearest deadline and disables
   * drag-and-drop (a dragged position would be overwritten by the sort on
   * the very next render) - changing a task's status while sorted this way
   * still works through the task detail dialog, just not by dragging it to
   * another column.
   */
  sortMode?: "manual" | "due_date";
  /**
   * True when at least one board filter (assignee/priority/tag) is
   * currently narrowing `tasks` - lets an empty column say "no tasks match
   * the current filters" instead of its normal empty-state hint, so a
   * filtered-to-zero column doesn't read as "nothing planned here".
   */
  filtersActive?: boolean;
  onOpenTask: (task: Task) => void;
  onCreateTask: (status: TaskStatus) => void;
  /**
   * Persist a move. `sortOrder` positions the task within the target column.
   * The parent is responsible for optimistic state and rollback.
   */
  onMoveTask: (
    task: Task,
    status: TaskStatus,
    sortOrder: number
  ) => Promise<void> | void;
  projectColor?: string;
}

interface DropTarget {
  status: TaskStatus;
  index: number;
}

/**
 * A card being dragged, tracked by pointer position (viewport coordinates)
 * rather than the browser's own native drag ghost - see task-card.tsx's
 * onDragStart/onDragMove doc comment for why. `x`/`y` are the ghost's
 * top-left, already adjusted for where within the card the user grabbed it
 * (grabOffsetX/Y), so the ghost stays glued to the pointer instead of
 * snapping to the card's corner or center on pickup.
 */
interface PointerDrag {
  task: Task;
  width: number;
  height: number;
  grabOffsetX: number;
  grabOffsetY: number;
  x: number;
  y: number;
}

function noop() {}

// Auto-scroll while a drag's pointer sits near a scroll container's edge -
// the board horizontally, the hovered column vertically - so a card can be
// dragged to a column or a position that's currently off-screen, the same
// way Trello/Linear-style boards do. Speed ramps up the closer the pointer
// is to the edge; outside the edge zone it's 0.
const AUTO_SCROLL_EDGE_PX = 64;
const AUTO_SCROLL_MAX_SPEED_PX = 14; // per animation frame, so ~840px/s at 60fps at the very edge

function edgeScrollDelta(distanceFromEdge: number): number {
  if (distanceFromEdge >= AUTO_SCROLL_EDGE_PX) return 0;
  const proximity = 1 - Math.max(distanceFromEdge, 0) / AUTO_SCROLL_EDGE_PX;
  return Math.round(proximity * AUTO_SCROLL_MAX_SPEED_PX);
}

export function KanbanBoard({
  tasks,
  members,
  commentCounts = {},
  coverImages = {},
  subtaskCounts = {},
  columns = BOARD_COLUMNS,
  canEdit,
  sortMode = "manual",
  filtersActive = false,
  onOpenTask,
  onCreateTask,
  onMoveTask,
  projectColor,
}: KanbanBoardProps) {
  const t = useTranslations("work");
  const [pointerDrag, setPointerDrag] = useState<PointerDrag | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const draggingTask = pointerDrag?.task ?? null;

  // Mirrors of the two state values above, read from inside stable
  // (empty/near-empty-deps) callbacks that fire on every pointermove tick -
  // see handleDragMove/handleDragEnd. Using state directly there would
  // either go stale (closure captured at callback-creation time) or force
  // the callback to depend on the very state it updates, changing identity
  // every tick and breaking every TaskCard's memo() (see task-card.tsx's
  // doc comment on TaskCardComponent).
  const pointerDragRef = useRef<PointerDrag | null>(null);
  const dropTargetRef = useRef<DropTarget | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingPosRef = useRef<{ x: number; y: number } | null>(null);
  const boardScrollRef = useRef<HTMLDivElement | null>(null);
  const autoScrollRafRef = useRef<number | null>(null);

  // Dragging is disabled while sorted by due date - see sortMode's doc
  // comment above.
  const canDrag = canEdit && sortMode === "manual";

  // Memoized so a dropTarget-only re-render (drag-move fires many times per
  // second while dragging) doesn't recompute these - and, just as
  // importantly, so TaskCard's memo() below actually holds: without this,
  // `groups[status]` and `membersById.get(...)` would hand out fresh
  // objects/Maps every render even when nothing the card displays changed.
  const groups = useMemo(
    () => groupTasksByStatus(tasks, sortMode === "due_date" ? compareTasksByDueDate : undefined),
    [tasks, sortMode]
  );
  const membersById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);

  const handleReorder = useCallback(
    async (task: Task, direction: "up" | "down") => {
      if (!canDrag) return;
      const status = normalizeTaskStatus(task.status);
      const column = groups[status];
      const currentIndex = column.findIndex((item) => item.id === task.id);
      if (currentIndex === -1) return;

      const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= column.length) return; // already at an edge

      const sortOrder = sortOrderForPosition(column, targetIndex, task.id);
      await onMoveTask(task, status, sortOrder);
    },
    [canDrag, groups, onMoveTask]
  );

  // Touch-friendly alternative to dragging - a precise drag on a small
  // screen is still more fiddly than a menu tap, so this stays as the
  // low-effort way to move a card between columns on mobile. Appends to
  // the end of the target column, same as dropping past the last card -
  // available whenever canEdit is, including in due_date sort mode where
  // dragging itself is disabled (see this component's own sortMode doc
  // comment: status changes still work there, just not by dragging).
  const handleMoveTo = useCallback(
    async (task: Task, status: TaskStatus) => {
      if (!canEdit || normalizeTaskStatus(task.status) === status) return;
      const column = groups[status];
      const sortOrder = sortOrderForPosition(column, column.length, task.id);
      await onMoveTask(task, status, sortOrder);
    },
    [canEdit, groups, onMoveTask]
  );

  const handleDrop = useCallback(
    async (task: Task, status: TaskStatus, index: number) => {
      if (!canDrag) return;
      const currentStatus = normalizeTaskStatus(task.status);
      const column = groups[status];
      const currentIndex = column.findIndex((item) => item.id === task.id);

      // No-op: dropped exactly where it already sits.
      if (
        currentStatus === status &&
        (currentIndex === index || currentIndex === index - 1)
      ) {
        return;
      }

      const sortOrder = sortOrderForPosition(column, index, task.id);
      await onMoveTask(task, status, sortOrder);
    },
    [canDrag, groups, onMoveTask]
  );

  // handleDragEnd (passed to every TaskCard as a stable, empty-deps
  // callback - see its own comment below) needs to call the *current*
  // handleDrop, which itself depends on `groups`/onMoveTask and so gets a
  // new identity on almost every render. A ref sidesteps the tradeoff
  // between "stale closure" and "breaks memo for every card on every
  // unrelated task update".
  const handleDropRef = useRef(handleDrop);
  useEffect(() => {
    handleDropRef.current = handleDrop;
  }, [handleDrop]);

  const cancelDrag = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (autoScrollRafRef.current != null) {
      cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = null;
    }
    pointerDragRef.current = null;
    dropTargetRef.current = null;
    setPointerDrag(null);
    setDropTarget(null);
  }, []);

  // Every drag must be interruptible, including by backing out entirely -
  // Escape cancels without committing a move, from anywhere on the page.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && pointerDragRef.current) {
        cancelDrag();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancelDrag]);

  // Hit-test by geometry, not by which DOM node happens to be underneath -
  // the ghost itself is pointer-events:none, so elementFromPoint always
  // resolves to real board content. Shared by handleDragMove (runs on
  // pointer movement) and runAutoScroll (runs on a timer while the pointer
  // sits still near an edge but the column scrolls underneath it) - either
  // one can change what's under the pointer.
  const updateDropTarget = useCallback((pos: { x: number; y: number }, draggedTaskId: string) => {
    const el = document.elementFromPoint(pos.x, pos.y);
    const columnEl = el?.closest<HTMLElement>("[data-column-status]") ?? null;
    if (!columnEl) return;

    const status = columnEl.dataset.columnStatus as TaskStatus;
    const cardEls = Array.from(
      columnEl.querySelectorAll<HTMLElement>("[data-card-id]")
    ).filter((card) => card.dataset.cardId !== draggedTaskId);

    let index = cardEls.length;
    for (let i = 0; i < cardEls.length; i += 1) {
      const cardRect = cardEls[i].getBoundingClientRect();
      if (pos.y < cardRect.top + cardRect.height / 2) {
        index = i;
        break;
      }
    }

    const next: DropTarget = { status, index };
    if (dropTargetRef.current?.status !== next.status || dropTargetRef.current?.index !== next.index) {
      dropTargetRef.current = next;
      setDropTarget(next);
    }
  }, []);

  // Runs every frame for the duration of a drag (started in handleDragStart,
  // stopped in handleDragEnd/cancelDrag) - not just in response to pointer
  // movement, since the whole point is to keep scrolling while the pointer
  // holds still near an edge. Scrolls the board horizontally and whichever
  // column is currently under the pointer vertically.
  //
  // Recurses via `runAutoScrollRef` rather than closing over its own
  // `useCallback` binding - referencing a useCallback-memoized function from
  // inside its own body doesn't see later updates to that binding (and the
  // lint rule for exactly that flags it), whereas a ref always reads the
  // current function.
  const runAutoScrollRef = useRef<() => void>(() => {});
  const runAutoScroll = useCallback(() => {
    const drag = pointerDragRef.current;
    const pos = pendingPosRef.current;
    if (!drag || !pos) {
      autoScrollRafRef.current = null;
      return;
    }

    let scrolled = false;

    const board = boardScrollRef.current;
    if (board) {
      const rect = board.getBoundingClientRect();
      const dx = edgeScrollDelta(rect.right - pos.x) - edgeScrollDelta(pos.x - rect.left);
      if (dx !== 0) {
        board.scrollLeft += dx;
        scrolled = true;
      }
    }

    const hoveredColumn = document.elementFromPoint(pos.x, pos.y)?.closest<HTMLElement>("[data-column-status]");
    const columnScroll = hoveredColumn?.querySelector<HTMLElement>("[data-column-scroll]") ?? null;
    if (columnScroll) {
      const rect = columnScroll.getBoundingClientRect();
      const dy = edgeScrollDelta(rect.bottom - pos.y) - edgeScrollDelta(pos.y - rect.top);
      if (dy !== 0) {
        columnScroll.scrollTop += dy;
        scrolled = true;
      }
    }

    // The pointer didn't necessarily move, but the content under it just
    // did - recompute what it's now hovering.
    if (scrolled) {
      updateDropTarget(pos, drag.task.id);
    }

    autoScrollRafRef.current = requestAnimationFrame(() => runAutoScrollRef.current());
  }, [updateDropTarget]);
  useEffect(() => {
    runAutoScrollRef.current = runAutoScroll;
  }, [runAutoScroll]);

  // Stable (no deps that change across renders) so TaskCard's memo() holds
  // for every card except the one actually being dragged.
  const handleDragStart = useCallback(
    (task: Task, element: HTMLElement, clientX: number, clientY: number) => {
      const rect = element.getBoundingClientRect();
      const next: PointerDrag = {
        task,
        width: rect.width,
        height: rect.height,
        grabOffsetX: clientX - rect.left,
        grabOffsetY: clientY - rect.top,
        x: rect.left,
        y: rect.top,
      };
      pointerDragRef.current = next;
      pendingPosRef.current = { x: clientX, y: clientY };
      setPointerDrag(next);
      if (autoScrollRafRef.current == null) {
        autoScrollRafRef.current = requestAnimationFrame(runAutoScroll);
      }
    },
    [runAutoScroll]
  );

  // Also stable. Throttled to one state update per animation frame - a
  // pointer can fire dozens of move events per second, far more than the
  // display can show, and each one otherwise re-renders the whole board.
  const handleDragMove = useCallback(
    (clientX: number, clientY: number) => {
      pendingPosRef.current = { x: clientX, y: clientY };
      if (rafRef.current != null) return;

      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const pos = pendingPosRef.current;
        const drag = pointerDragRef.current;
        if (!pos || !drag) return;

        const nextGhost: PointerDrag = {
          ...drag,
          x: pos.x - drag.grabOffsetX,
          y: pos.y - drag.grabOffsetY,
        };
        pointerDragRef.current = nextGhost;
        setPointerDrag(nextGhost);
        updateDropTarget(pos, drag.task.id);
      });
    },
    [updateDropTarget]
  );

  // Also stable - reads the just-dropped task/target from refs rather than
  // closing over the state values, for the same memo-preserving reason as
  // handleDragStart/handleDragMove above.
  const handleDragEnd = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (autoScrollRafRef.current != null) {
      cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = null;
    }
    const drag = pointerDragRef.current;
    const target = dropTargetRef.current;
    pointerDragRef.current = null;
    dropTargetRef.current = null;
    setPointerDrag(null);
    setDropTarget(null);
    if (!drag || !target) return;
    void handleDropRef.current(drag.task, target.status, target.index);
  }, []);

  // Stop the persistent auto-scroll loop if the board unmounts mid-drag
  // (e.g. navigating away) rather than letting a stray rAF loop run on.
  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      if (autoScrollRafRef.current != null) cancelAnimationFrame(autoScrollRafRef.current);
    };
  }, []);

  const ghostAssignee = draggingTask?.assignee_id ? membersById.get(draggingTask.assignee_id) : undefined;

  // `relative` makes this scroll container the containing block for the
  // columns' absolutely-positioned descendants (the `sr-only` labels):
  // without it they're positioned against an ancestor outside the
  // overflow clip, so off-screen columns' labels stretched the whole page
  // sideways (the landing page's demo board scrolled 1200px on a phone).
  return (
    <div
      ref={boardScrollRef}
      className="relative flex gap-4 overflow-x-auto pb-4"
      role="list"
      aria-label={t("taskBoardAria")}
    >
      {columns.map((column) => {
        const columnTasks = groups[column.status];
        const isTargetColumn = dropTarget?.status === column.status;

        return (
          <section
            key={column.status}
            data-column-status={column.status}
            role="listitem"
            aria-label={t("columnAria", { label: column.label, count: columnTasks.length })}
            className={cn(
              "flex w-72 shrink-0 flex-col rounded-xl border border-border bg-background-secondary",
              isTargetColumn && "border-primary/40"
            )}
            style={isTargetColumn && projectColor ? { borderColor: projectColor } : undefined}
          >
            <header className="flex items-center gap-2 border-b border-border px-3 py-2.5">
              <span
                aria-hidden
                className={cn("h-2 w-2 rounded-full", projectColor ? "" : column.accentClass)}
                style={projectColor ? { backgroundColor: projectColor } : undefined}
              />
              <h3 className="text-sm font-medium text-foreground">
                {column.label}
              </h3>
              <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
                {columnTasks.length}
              </span>
              {canEdit && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  aria-label={t("addTaskToColumn", { column: column.label })}
                  onClick={() => onCreateTask(column.status)}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              )}
            </header>

            <div
              data-column-scroll
              className="flex min-h-32 max-h-[calc(100vh-16rem)] flex-1 flex-col gap-2 overflow-y-auto p-2"
            >
              {columnTasks.map((task, index) => (
                <div key={task.id}>
                  <DropZone
                    active={
                      isTargetColumn &&
                      dropTarget?.index === index &&
                      draggingTask?.id !== task.id
                    }
                    enabled={Boolean(draggingTask) && canDrag}
                    grow={false}
                    projectColor={projectColor}
                  />
                  <TaskCard
                    task={task}
                    assignee={
                      task.assignee_id
                        ? membersById.get(task.assignee_id)
                        : undefined
                    }
                    commentCount={commentCounts[task.id]}
                    coverImageUrl={coverImages[task.id]}
                    subtaskProgress={subtaskCounts[task.id]}
                    draggable={canDrag}
                    isDragging={draggingTask?.id === task.id}
                    onOpen={onOpenTask}
                    onDragStart={handleDragStart}
                    onDragMove={handleDragMove}
                    onDragEnd={handleDragEnd}
                    onReorder={canDrag ? handleReorder : undefined}
                    canMoveUp={index > 0}
                    canMoveDown={index < columnTasks.length - 1}
                    moveTargets={canEdit ? columns.filter((c) => c.status !== column.status) : undefined}
                    onMoveTo={canEdit ? handleMoveTo : undefined}
                  />
                </div>
              ))}

              <DropZone
                active={
                  isTargetColumn && dropTarget?.index === columnTasks.length
                }
                enabled={Boolean(draggingTask) && canDrag}
                grow
                projectColor={projectColor}
              />

              {columnTasks.length === 0 && !draggingTask && (
                <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                  {filtersActive ? t("noTasksMatchFilters") : column.hint}
                </p>
              )}
            </div>
          </section>
        );
      })}

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {pointerDrag && draggingTask && (
              <motion.div
                key={draggingTask.id}
                initial={{ scale: 1, opacity: 0.9, boxShadow: "0 1px 2px rgba(0,0,0,0.08)" }}
                animate={{
                  scale: 1.03,
                  opacity: 1,
                  boxShadow: "0 24px 40px -12px rgba(0,0,0,0.35)",
                }}
                exit={{ scale: 0.97, opacity: 0, transition: { duration: 0.15, ease: "easeOut" } }}
                transition={{ type: "spring", damping: 30, stiffness: 420 }}
                style={{
                  position: "fixed",
                  left: pointerDrag.x,
                  top: pointerDrag.y,
                  width: pointerDrag.width,
                  zIndex: 100,
                  pointerEvents: "none",
                }}
              >
                <TaskCard
                  task={draggingTask}
                  assignee={ghostAssignee}
                  commentCount={commentCounts[draggingTask.id]}
                  coverImageUrl={coverImages[draggingTask.id]}
                  subtaskProgress={subtaskCounts[draggingTask.id]}
                  draggable={false}
                  isDragging={false}
                  onOpen={noop}
                  onDragStart={noop}
                  onDragMove={noop}
                  onDragEnd={noop}
                />
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}

/**
 * Insertion point between cards. Kept a few pixels tall when idle so it is
 * easy to hit, and it expands into a visible rule while hovered. Purely
 * presentational - kanban-board.tsx computes `active` from the dragged
 * pointer's position via geometric hit-testing (handleDragMove), not from
 * events fired on this element.
 */
function DropZone({
  active,
  enabled,
  grow = false,
  projectColor,
}: {
  active: boolean;
  enabled: boolean;
  grow?: boolean;
  projectColor?: string;
}) {
  if (!enabled) {
    return grow ? <div className="flex-1" /> : null;
  }

  return (
    <div className={cn("transition-all", grow ? "min-h-8 flex-1" : "h-2", active && "h-2")}>
      <div
        className={cn(
          "h-0.5 rounded-full transition-colors",
          active ? "bg-primary" : "bg-transparent"
        )}
        style={active && projectColor ? { backgroundColor: projectColor } : undefined}
      />
    </div>
  );
}
