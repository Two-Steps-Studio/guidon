"use client";

import { cn } from "@/lib/utils";
import {
  DUE_STATE_CLASSES,
  PRIORITY_DOT_CLASSES,
  PRIORITY_LABELS,
  dueState,
  formatDueDate,
  normalizeTaskPriority,
} from "@/lib/work/task-board";
import type { Task } from "@/types/task";
import type { SubtaskProgress } from "@/lib/work/task-board";
import { CalendarDays, ListChecks, MessageSquare } from "lucide-react";

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
}

export function initialsFor(member: TaskCardMember): string {
  const source = member.full_name?.trim() || member.email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);

  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function TaskCard({
  task,
  assignee,
  commentCount = 0,
  subtaskProgress,
  draggable,
  isDragging,
  onOpen,
  onDragStart,
  onDragEnd,
}: TaskCardProps) {
  const priority = normalizeTaskPriority(task.priority);
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
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Open task ${task.title}`}
      className={cn(
        "group rounded-lg border border-border bg-card p-3 text-left",
        "shadow-sm transition-colors",
        "hover:border-border-hover hover:bg-surface-hover",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        draggable && "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-40"
      )}
    >
      <div className="flex items-start gap-2">
        <span
          aria-hidden
          className={cn(
            "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
            PRIORITY_DOT_CLASSES[priority]
          )}
        />
        <h4 className="flex-1 text-sm font-medium leading-snug text-foreground line-clamp-3">
          {task.title}
        </h4>
      </div>

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
        <span className="sr-only">Priority: </span>
        <span className="tabular-nums">{PRIORITY_LABELS[priority]}</span>

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
            <span className="sr-only">Subtasks: </span>
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
              title="Unassigned"
              aria-label="Unassigned"
              className="block h-5 w-5 rounded-full border border-dashed border-border"
            />
          )}
        </span>
      </div>
    </article>
  );
}
