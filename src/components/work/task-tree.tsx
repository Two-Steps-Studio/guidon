"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import type { TaskCardMember } from "@/components/work/task-card";
import type { BoardColumn } from "@/lib/work/task-board";
import { cn } from "@/lib/utils";
import type { Task } from "@/types/task";

/**
 * The board as a tree: every top-level task with its subtasks (and theirs)
 * nested under it, in board order (column, then the board's own order).
 * Read-only like a list; a click opens the task, as a card does.
 */
export function TaskTree({
  tasks,
  subtasksByParent,
  columns,
  members,
  onOpenTask,
}: {
  tasks: Task[];
  subtasksByParent: Record<string, Task[]>;
  columns: readonly BoardColumn[];
  members: TaskCardMember[];
  onOpenTask: (task: Task) => void;
}) {
  const t = useTranslations("work");
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const columnIndex = new Map(columns.map((column, index) => [column.status, index]));
  const ordered = [...tasks].sort(
    (a, b) => (columnIndex.get(a.status) ?? 99) - (columnIndex.get(b.status) ?? 99) || (a.sort_order ?? 0) - (b.sort_order ?? 0)
  );

  const toggle = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // depth guards against a parent loop in bad data; real trees are shallow.
  const renderTasks = (list: Task[], depth: number) => (
    <ul className={cn(depth > 0 && "ml-5 border-l border-border pl-3")}>
      {list.map((task) => {
        const children = depth < 8 ? subtasksByParent[task.id] ?? [] : [];
        const open = !collapsed.has(task.id);
        const column = columns.find((item) => item.status === task.status);
        const assignee = members.find((member) => member.id === task.assignee_id);
        return (
          <li key={task.id} className="py-0.5">
            <div className="flex min-h-11 items-center gap-1 rounded-md hover:bg-accent/50">
              {children.length > 0 ? (
                <button
                  type="button"
                  onClick={() => toggle(task.id)}
                  aria-expanded={open}
                  aria-label={open ? t("treeCollapse", { title: task.title }) : t("treeExpand", { title: task.title })}
                  className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ChevronRight aria-hidden className={cn("size-4 transition-transform", open && "rotate-90")} />
                </button>
              ) : (
                <span aria-hidden className="size-8 shrink-0" />
              )}
              <button
                type="button"
                onClick={() => onOpenTask(task)}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className={cn("min-w-0 flex-1 truncate text-sm", task.is_done && "text-muted-foreground line-through")}>{task.title}</span>
                {children.length > 0 && (
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {children.filter((child) => child.is_done).length}/{children.length}
                  </span>
                )}
                {assignee && (
                  <span className="hidden max-w-32 shrink-0 truncate text-xs text-muted-foreground sm:inline">
                    {assignee.full_name || assignee.email}
                  </span>
                )}
                <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                  {column?.label ?? task.status}
                </span>
              </button>
            </div>
            {children.length > 0 && open && renderTasks(children, depth + 1)}
          </li>
        );
      })}
    </ul>
  );

  return (
    <section aria-label={t("treeLabel")} className="rounded-xl border border-border bg-background p-2">
      {renderTasks(ordered, 0)}
    </section>
  );
}
