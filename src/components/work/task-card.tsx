"use client";

import { memo } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
  DUE_STATE_CLASSES,
  PRIORITY_DOT_CLASSES,
  dueState,
  formatDueDate,
  isDone,
  normalizeTaskPriority,
} from "@/lib/work/task-board";
import type { Task, TaskStatus } from "@/types/task";
import type { BoardColumn, SubtaskProgress } from "@/lib/work/task-board";
import { CalendarDays, CheckCircle2, ListChecks, MessageSquare, MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export interface TaskCardMember {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
}

interface TaskCardProps {
  task: Task;
  assignee?: TaskCardMember;
  commentCount?: number;
  subtaskProgress?: SubtaskProgress;
  draggable: boolean;
  isDragging: boolean;
  onOpen: (task: Task) => void;
  onDragStart: (task: Task) => void;
  onDragEnd: () => void;
  /** Alt+Up/Alt+Down calls this - the keyboard equivalent of a within-
   * column drag, which native HTML5 drag-and-drop has no keyboard path
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
}

/** One plain-text line of a (markdown) description for the card, or "" when there is none. */
function descriptionPreview(description: string | null | undefined): string {
  if (!description) return "";
  return description
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^\s*[-*+]\s+\[[xX]\]\s+/gm, "☑ ")
    .replace(/^\s*[-*+]\s+\[ \]\s+/gm, "☐ ")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .replace(/[#>*_~`|]/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function initialsFor(member: TaskCardMember): string {
  const source = member.full_name?.trim() || member.email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);

  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * Wrapped in memo() below: KanbanBoard re-renders on every dragover tick
 * (dropTarget state tracks the hovered insertion point, which changes many
 * times per second while dragging) - without memo, every card in every
 * column re-rendered on each of those ticks, not just the one being
 * dragged. KanbanBoard's onDragStart/onDragEnd/onReorder props are stable
 * (useState setters / useCallback), and isDragging/canMoveUp/canMoveDown
 * are plain booleans, so for any card other than the one actually being
 * dragged or reordered, every prop is reference-equal across a re-render
 * and memo correctly skips it.
 */
function TaskCardComponent({
  task,
  assignee,
  commentCount = 0,
  subtaskProgress,
  draggable,
  isDragging,
  onOpen,
  onDragStart,
  onDragEnd,
  onReorder,
  canMoveUp = false,
  canMoveDown = false,
  moveTargets,
  onMoveTo,
}: TaskCardProps) {
  const t = useTranslations("work");
  const priority = normalizeTaskPriority(task.priority);
  const preview = descriptionPreview(task.description);
  const done = isDone(task.status);
  const due = dueState(task.due_date, task.status);
  const tags = task.tags ?? [];

  return (
    <article
      draggable={draggable}
      onDragStart={(event) => {
        // dataTransfer must be set for Firefox to start a drag at all.
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", task.id);
        onDragStart(task);
      }}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(task)}
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
        "group rounded-lg border border-border bg-card p-3 text-left",
        "shadow-sm transition-colors",
        "hover:border-border-hover hover:bg-surface-hover",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        draggable && "cursor-grab active:cursor-grabbing",
        done && "opacity-70 hover:opacity-100",
        isDragging && "opacity-40"
      )}
    >
      <div className="flex items-start gap-2">
        {done ? (
          <CheckCircle2 aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
        ) : (
          <span
            aria-hidden
            className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", PRIORITY_DOT_CLASSES[priority])}
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

      {preview && (
        <p className="mt-1 pl-3.5 text-xs leading-snug text-muted-foreground line-clamp-2">{preview}</p>
      )}

      {tags.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1 pl-3.5">
          {tags.slice(0, 3).map((tag) => (
            <li
              key={tag}
              className="rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] leading-none text-muted-foreground"
            >
              {tag}
            </li>
          ))}
          {tags.length > 3 && (
            <li className="px-1 py-0.5 text-[11px] leading-none text-muted-foreground">
              +{tags.length - 3}
            </li>
          )}
        </ul>
      )}

      <div className="mt-3 flex items-center gap-3 pl-3.5 text-[11px] text-muted-foreground">
        <span className="sr-only">{t("priorityScreenReader")}</span>
        <span className="tabular-nums">{t("priority", { priority })}</span>

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
