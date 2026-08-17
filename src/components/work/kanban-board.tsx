"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  BOARD_COLUMNS,
  groupTasksByStatus,
  normalizeTaskStatus,
  sortOrderForPosition,
} from "@/lib/work/task-board";
import { TaskCard, type TaskCardMember } from "@/components/work/task-card";
import type { Task, TaskStatus } from "@/types/task";

interface KanbanBoardProps {
  tasks: Task[];
  members: TaskCardMember[];
  commentCounts?: Record<string, number>;
  /** When false the board is read-only (viewer/tester roles). */
  canEdit: boolean;
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
}

interface DropTarget {
  status: TaskStatus;
  index: number;
}

export function KanbanBoard({
  tasks,
  members,
  commentCounts = {},
  canEdit,
  onOpenTask,
  onCreateTask,
  onMoveTask,
}: KanbanBoardProps) {
  const [draggingTask, setDraggingTask] = useState<Task | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  const groups = groupTasksByStatus(tasks);
  const membersById = new Map(members.map((member) => [member.id, member]));

  const resetDrag = () => {
    setDraggingTask(null);
    setDropTarget(null);
  };

  const handleDrop = async (status: TaskStatus, index: number) => {
    const task = draggingTask;
    resetDrag();

    if (!task || !canEdit) return;

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
  };

  return (
    <div
      className="flex gap-4 overflow-x-auto pb-4"
      role="list"
      aria-label="Task board"
    >
      {BOARD_COLUMNS.map((column) => {
        const columnTasks = groups[column.status];
        const isTargetColumn = dropTarget?.status === column.status;

        return (
          <section
            key={column.status}
            role="listitem"
            aria-label={`${column.label}, ${columnTasks.length} tasks`}
            className={cn(
              "flex w-72 shrink-0 flex-col rounded-xl border border-border bg-background-secondary",
              isTargetColumn && "border-primary/40"
            )}
            onDragOver={(event) => {
              if (!draggingTask || !canEdit) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              // Dropping on column padding appends to the end.
              if (!isTargetColumn) {
                setDropTarget({
                  status: column.status,
                  index: columnTasks.length,
                });
              }
            }}
            onDrop={(event) => {
              if (!draggingTask || !canEdit) return;
              event.preventDefault();
              void handleDrop(
                column.status,
                dropTarget?.status === column.status
                  ? dropTarget.index
                  : columnTasks.length
              );
            }}
          >
            <header className="flex items-center gap-2 border-b border-border px-3 py-2.5">
              <span
                aria-hidden
                className={cn("h-2 w-2 rounded-full", column.accentClass)}
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
                  aria-label={`Add task to ${column.label}`}
                  onClick={() => onCreateTask(column.status)}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              )}
            </header>

            <div className="flex min-h-32 flex-1 flex-col gap-2 p-2">
              {columnTasks.map((task, index) => (
                <div key={task.id}>
                  <DropZone
                    active={
                      isTargetColumn &&
                      dropTarget?.index === index &&
                      draggingTask?.id !== task.id
                    }
                    enabled={Boolean(draggingTask) && canEdit}
                    onEnter={() =>
                      setDropTarget({ status: column.status, index })
                    }
                    onDrop={() => void handleDrop(column.status, index)}
                  />
                  <TaskCard
                    task={task}
                    assignee={
                      task.assignee_id
                        ? membersById.get(task.assignee_id)
                        : undefined
                    }
                    commentCount={commentCounts[task.id]}
                    draggable={canEdit}
                    isDragging={draggingTask?.id === task.id}
                    onOpen={onOpenTask}
                    onDragStart={setDraggingTask}
                    onDragEnd={resetDrag}
                  />
                </div>
              ))}

              <DropZone
                active={
                  isTargetColumn && dropTarget?.index === columnTasks.length
                }
                enabled={Boolean(draggingTask) && canEdit}
                onEnter={() =>
                  setDropTarget({
                    status: column.status,
                    index: columnTasks.length,
                  })
                }
                onDrop={() => void handleDrop(column.status, columnTasks.length)}
                grow
              />

              {columnTasks.length === 0 && !draggingTask && (
                <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                  {column.hint}
                </p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/**
 * Insertion point between cards. Kept a few pixels tall when idle so it is
 * easy to hit, and it expands into a visible rule while hovered.
 */
function DropZone({
  active,
  enabled,
  onEnter,
  onDrop,
  grow = false,
}: {
  active: boolean;
  enabled: boolean;
  onEnter: () => void;
  onDrop: () => void;
  grow?: boolean;
}) {
  if (!enabled) {
    return grow ? <div className="flex-1" /> : null;
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onEnter();
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onDrop();
      }}
      className={cn(
        "transition-all",
        grow ? "min-h-8 flex-1" : "h-2",
        active && "h-2"
      )}
    >
      <div
        className={cn(
          "h-0.5 rounded-full transition-colors",
          active ? "bg-primary" : "bg-transparent"
        )}
      />
    </div>
  );
}
