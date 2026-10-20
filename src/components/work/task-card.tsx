"use client";

import { memo, useCallback, useEffect, useRef } from "react";
import { initialsFor } from "@/lib/people";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
  DUE_STATE_CLASSES,
  dueState,
  formatDueDate,
  isTaskDone,
  priorityDef,
  priorityDot,
} from "@/lib/work/task-board";
import type { Task, TaskStatus } from "@/types/task";
import type { BoardColumn, SubtaskProgress } from "@/lib/work/task-board";
import { CalendarDays, CheckCircle2, CheckSquare, ListChecks, MessageSquare, MoreVertical, Square } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { LabelChip } from "@/components/work/label-chip";
import { useLabelPresets } from "@/components/work/label-presets-context";
import { usePriorities } from "@/components/work/workflow-context";
import { findLabelPreset } from "@/lib/work/label-presets";

export interface TaskCardMember {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
}

// Mouse/pen: distance past which a press commits to a drag instead of a click.
const DRAG_MOVE_THRESHOLD_PX = 8;
// Touch: a drag needs a short hold first, so a swipe across a card scrolls the
// board instead of grabbing the card. Moving further than the tolerance before
// the hold completes means the user is scrolling, and the gesture is dropped.
// An earlier 200ms long-press lost to the browser's native scroll on real
// phones because nothing ever cancelled it; the non-passive touchmove listener
// in TaskCardComponent now does, but only once the hold has armed the drag.
const TOUCH_HOLD_MS = 300;
const TOUCH_HOLD_TOLERANCE_PX = 10;

interface TaskCardProps {
  task: Task;
  assignee?: TaskCardMember;
  commentCount?: number;
  /** Signed URL of the task's most recently uploaded image attachment, if any. */
  coverImageUrl?: string;
  subtaskProgress?: SubtaskProgress;
  draggable: boolean;
  isDragging: boolean;
  onOpen: (task: Task) => void;
  /**
   * Pointer-based drag-and-drop (kanban-board.tsx owns the actual drag
   * state/ghost/hit-testing - this component only detects gesture intent
   * and reports raw viewport coordinates). Replaces native HTML5
   * draggable/dragstart/dragover/drop, which never fires on touch at all
   * and gives the browser - not this component - control of the drag
   * ghost, so it can't track the pointer 1:1 or be grabbed mid-flight.
   */
  onDragStart: (task: Task, element: HTMLElement, clientX: number, clientY: number) => void;
  onDragMove: (clientX: number, clientY: number) => void;
  onDragEnd: () => void;
  /** Alt+Up/Alt+Down calls this - the keyboard equivalent of a within-
   * column drag, which the pointer gesture above has no keyboard path
   * for at all. Undefined (not just a no-op) when the board is read-only,
   * so the shortcut isn't advertised via aria-keyshortcuts when it
   * wouldn't do anything. */
  onReorder?: (task: Task, direction: "up" | "down") => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  /** Other columns this card can move to - omitted (not just empty) when the board is read-only, same reasoning as onReorder above. */
  moveTargets?: readonly BoardColumn[];
  /** Touch-friendly alternative to dragging - see kanban-board.tsx's handleMoveTo doc comment for why this exists. */
  onMoveTo?: (task: Task, status: TaskStatus) => void;
  /** Part of the board's bulk selection (Ctrl/Cmd/Shift-click). */
  selected?: boolean;
  /** Ctrl/Cmd-click toggles this card, Shift-click extends from the last one. Undefined on a read-only board. */
  onSelect?: (task: Task, range: boolean) => void;
}

/**
 * A (markdown) description as plain-text lines for the card: each list or
 * checklist item its own line, the way it was written, instead of all of it
 * run together; each paragraph of prose one line. Empty when there's nothing
 * to show.
 */
export function descriptionPreview(description: string | null | undefined): { text: string; item: boolean }[] {
  if (!description) return [];
  const lines: { text: string; item: boolean }[] = [];
  let prose: string[] = [];
  const flush = () => {
    if (prose.length) lines.push({ text: prose.join(" "), item: false });
    prose = [];
  };
  for (const raw of description.replace(/```[\s\S]*?```/g, "\n").split("\n")) {
    const item = raw.match(/^\s*(?:[-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?(.*)$/);
    const text = (item ? item[2] : raw)
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[#>*_~`|]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (item) {
      flush();
      if (text) lines.push({ text: `${item[1] ? (/x/i.test(item[1]) ? "☑" : "☐") : "•"} ${text}`, item: true });
    } else if (text) {
      prose.push(text);
    } else {
      flush();
    }
  }
  flush();
  return lines;
}

/** How many description lines a card shows. */
const CARD_DESCRIPTION_LINES = 4;

interface Gesture {
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  armed: boolean;
  holdTimer: ReturnType<typeof setTimeout> | null;
}

function clearHoldTimer(gesture: Gesture) {
  if (gesture.holdTimer != null) {
    clearTimeout(gesture.holdTimer);
    gesture.holdTimer = null;
  }
}

/**
 * Wrapped in memo() below: KanbanBoard re-renders on every drag-move tick
 * (dropTarget/ghost position tracks the pointer, which changes many times
 * per second while dragging) - without memo, every card in every column
 * re-rendered on each of those ticks, not just the one being dragged.
 * KanbanBoard's onDragStart/onDragMove/onDragEnd/onReorder props are
 * referentially stable (useCallback with empty/ref-based deps - see
 * kanban-board.tsx), and isDragging/canMoveUp/canMoveDown are plain
 * booleans, so for any card other than the one actually being dragged or
 * reordered, every prop is reference-equal across a re-render and memo
 * correctly skips it.
 */
function TaskCardComponent({
  task,
  assignee,
  commentCount = 0,
  coverImageUrl,
  subtaskProgress,
  draggable,
  isDragging,
  onOpen,
  onDragStart,
  onDragMove,
  onDragEnd,
  onReorder,
  canMoveUp = false,
  canMoveDown = false,
  moveTargets,
  onMoveTo,
  selected = false,
  onSelect,
}: TaskCardProps) {
  const t = useTranslations("work");
  const priorities = usePriorities();
  const priority = priorityDef(task.priority, priorities);
  const priorityStyle = priorityDot(task.priority, priorities);
  const preview = descriptionPreview(task.description);
  const done = isTaskDone(task);
  const due = dueState(task.due_date, task.status, done);
  const tags = task.tags ?? [];
  const labelPresets = useLabelPresets();

  const gestureRef = useRef<Gesture | null>(null);
  const cardRef = useRef<HTMLElement>(null);
  // A drag that ends on the card's own element also dispatches a browser
  // click right after pointerup - without this, dropping a card reopens it.
  const suppressClickRef = useRef(false);

  // React's onTouchMove is passive and can't preventDefault. This listener is
  // registered up front (iOS ignores preventDefault from listeners added
  // mid-gesture) but only blocks scrolling once a hold has armed a drag.
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const blockScrollWhileDragging = (event: TouchEvent) => {
      if (gestureRef.current?.armed) event.preventDefault();
    };
    card.addEventListener("touchmove", blockScrollWhileDragging, { passive: false });
    return () => {
      card.removeEventListener("touchmove", blockScrollWhileDragging);
      if (gestureRef.current) clearHoldTimer(gestureRef.current);
    };
  }, []);

  const arm = useCallback(
    (gesture: Gesture, element: HTMLElement) => {
      clearHoldTimer(gesture);
      gesture.armed = true;
      suppressClickRef.current = true;
      try {
        element.setPointerCapture(gesture.pointerId);
      } catch {
        // Not fatal - the drag still proceeds via normally-bubbled events,
        // just without capture's "keep tracking outside the card" guarantee.
      }
      onDragStart(task, element, gesture.startX, gesture.startY);
    },
    [onDragStart, task]
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      // A long-press usually isn't followed by a click, so a flag left over
      // from the previous drag would otherwise swallow the next real tap.
      suppressClickRef.current = false;
      if (!draggable) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      // A modifier-click selects the card (onClick below) - never a drag.
      if (onSelect && (event.metaKey || event.ctrlKey || event.shiftKey)) return;
      // Don't hijack the "..." move-to menu's own press/click.
      if ((event.target as HTMLElement).closest("button")) return;

      if (gestureRef.current) clearHoldTimer(gestureRef.current);
      const gesture: Gesture = {
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        startX: event.clientX,
        startY: event.clientY,
        armed: false,
        holdTimer: null,
      };
      gestureRef.current = gesture;

      if (event.pointerType === "touch") {
        const element = event.currentTarget;
        gesture.holdTimer = setTimeout(() => {
          gesture.holdTimer = null;
          if (gestureRef.current !== gesture || gesture.armed) return;
          arm(gesture, element);
          navigator.vibrate?.(10);
        }, TOUCH_HOLD_MS);
      }
    },
    [arm, draggable, onSelect]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;

      if (!gesture.armed) {
        const distance = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY);
        if (gesture.pointerType === "touch") {
          if (distance > TOUCH_HOLD_TOLERANCE_PX) {
            clearHoldTimer(gesture);
            gestureRef.current = null;
          }
          return;
        }
        if (distance < DRAG_MOVE_THRESHOLD_PX) return;
        arm(gesture, event.currentTarget);
      }

      event.preventDefault();
      onDragMove(event.clientX, event.clientY);
    },
    [arm, onDragMove]
  );

  const endGesture = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      gestureRef.current = null;
      clearHoldTimer(gesture);
      if (gesture.armed) {
        try {
          event.currentTarget.releasePointerCapture(gesture.pointerId);
        } catch {
          // Already released/invalidated - the drag has already ended either way.
        }
        onDragEnd();
      }
    },
    [onDragEnd]
  );

  return (
    <article
      ref={cardRef}
      data-card-id={task.id}
      onContextMenu={(event) => {
        // Android fires contextmenu on a long-press - that's our drag gesture.
        if (gestureRef.current) event.preventDefault();
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endGesture}
      onPointerCancel={endGesture}
      onClick={(event) => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          return;
        }
        if (onSelect && (event.metaKey || event.ctrlKey || event.shiftKey)) {
          event.preventDefault();
          onSelect(task, event.shiftKey);
          return;
        }
        onOpen(task);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(task);
          return;
        }
        if (onReorder && event.altKey && event.key === "ArrowUp" && canMoveUp) {
          event.preventDefault();
          onReorder(task, "up");
          return;
        }
        if (onReorder && event.altKey && event.key === "ArrowDown" && canMoveDown) {
          event.preventDefault();
          onReorder(task, "down");
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={t("openTaskAria", { title: task.title })}
      aria-keyshortcuts={onReorder ? "Alt+ArrowUp Alt+ArrowDown" : undefined}
      className={cn(
        "group select-none rounded-lg border border-border bg-card p-3 text-left",
        "shadow-sm transition-colors",
        "hover:border-border-hover hover:bg-surface-hover",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        // touch-manipulation keeps native scrolling on cards (a drag needs a
        // hold first - see TOUCH_HOLD_MS). [-webkit-touch-callout:none]
        // suppresses iOS's long-press callout over the cover image, which
        // would otherwise pop up alongside the drag.
        draggable && "cursor-grab touch-manipulation [-webkit-touch-callout:none] active:cursor-grabbing",
        done && "opacity-70 hover:opacity-100",
        isDragging && "opacity-40",
        selected && "border-primary bg-primary/5 ring-2 ring-primary/60 hover:border-primary"
      )}
    >
      {selected && <span className="sr-only">{t("cardSelected")}</span>}
      {coverImageUrl && (
        <div className="-mx-3 -mt-3 mb-2 overflow-hidden rounded-t-lg">
          {/* eslint-disable-next-line @next/next/no-img-element -- signed, per-task URL from any storage provider (local or Supabase), not a static/optimizable asset - same reasoning as TaskImageGallery's own img */}
          <img
            src={coverImageUrl}
            alt=""
            className="h-28 w-full object-cover"
          />
        </div>
      )}
      <div className="flex items-start gap-2">
        {done ? (
          <CheckCircle2 aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
        ) : (
          <span
            aria-hidden
            className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", priorityStyle.className)}
            style={priorityStyle.style}
          />
        )}
        <h4
          className={cn(
            "flex-1 text-sm font-medium leading-snug line-clamp-3",
            done ? "text-muted-foreground line-through decoration-muted-foreground/50" : "text-foreground"
          )}
        >
          {task.title}
        </h4>
        {onMoveTo && moveTargets && moveTargets.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 opacity-0 focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-100"
                aria-label={t("moveTaskAria", { title: task.title })}
                onClick={(event) => event.stopPropagation()}
              >
                <MoreVertical className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
              {moveTargets.map((target) => (
                <DropdownMenuItem key={target.status} onSelect={() => onMoveTo(task, target.status)}>
                  {t("moveToColumn", { column: target.label })}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {preview.length > 0 && (
        // A paragraph gets up to two lines, a list item one, so a list in the
        // description still shows as a list instead of being cut off by prose.
        <div className="mt-1 space-y-0.5 pl-3.5 text-xs leading-snug text-muted-foreground">
          {preview.slice(0, CARD_DESCRIPTION_LINES).map((line, index) => (
            <p key={index} className={line.item ? "truncate" : "line-clamp-2"}>
              {line.text}
              {index === CARD_DESCRIPTION_LINES - 1 && preview.length > CARD_DESCRIPTION_LINES && " …"}
            </p>
          ))}
        </div>
      )}

      {subtaskProgress?.items && subtaskProgress.items.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 pl-3.5 text-xs text-muted-foreground" aria-label={t("subtasksScreenReader")}>
          {subtaskProgress.items.map((item) => (
            <li key={item.id} className="flex items-center gap-1.5">
              {item.done ? (
                <CheckSquare className="h-3 w-3 shrink-0 text-success" aria-hidden />
              ) : (
                <Square className="h-3 w-3 shrink-0" aria-hidden />
              )}
              <span className={cn("truncate", item.done && "line-through")}>{item.title}</span>
            </li>
          ))}
          {subtaskProgress.total > subtaskProgress.items.length && (
            <li className="pl-[18px]">+{subtaskProgress.total - subtaskProgress.items.length}</li>
          )}
        </ul>
      )}

      {tags.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1 pl-3.5">
          {tags.slice(0, 3).map((tag) => {
            const preset = findLabelPreset(labelPresets, tag);
            return preset ? (
              <li key={tag} className="max-w-full">
                <LabelChip name={tag} color={preset.color} className="py-0 text-[11px] leading-4" />
              </li>
            ) : (
              <li
                key={tag}
                className="rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] leading-none text-muted-foreground"
              >
                {tag}
              </li>
            );
          })}
          {tags.length > 3 && (
            <li className="px-1 py-0.5 text-[11px] leading-none text-muted-foreground">
              +{tags.length - 3}
            </li>
          )}
        </ul>
      )}

      <div className="mt-3 flex items-center gap-3 pl-3.5 text-[11px] text-muted-foreground">
        <span className="sr-only">{t("priorityScreenReader")}</span>
        <span className="tabular-nums">{priority.label}</span>

        {task.due_date && due !== "none" && (
          <span className={cn("flex items-center gap-1", DUE_STATE_CLASSES[due])}>
            <CalendarDays className="h-3 w-3" aria-hidden />
            {formatDueDate(task.due_date)}
            {due === "overdue" && <span className="sr-only">(overdue)</span>}
          </span>
        )}

        {commentCount > 0 && (
          <span className="flex items-center gap-1">
            <MessageSquare className="h-3 w-3" aria-hidden />
            {commentCount}
          </span>
        )}

        {subtaskProgress && subtaskProgress.total > 0 && (
          <span className="flex items-center gap-1">
            <ListChecks className="h-3 w-3" aria-hidden />
            <span className="sr-only">{t("subtasksScreenReader")}</span>
            {subtaskProgress.done}/{subtaskProgress.total}
          </span>
        )}

        <span className="ml-auto">
          {assignee ? (
            <span
              title={assignee.full_name || assignee.email}
              className="flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-[10px] font-medium text-secondary-foreground"
            >
              {initialsFor(assignee)}
            </span>
          ) : (
            <span
              title={t("unassignedTitle")}
              aria-label={t("unassignedTitle")}
              className="block h-5 w-5 rounded-full border border-dashed border-border"
            />
          )}
        </span>
      </div>
    </article>
  );
}

export const TaskCard = memo(TaskCardComponent);
