"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/ui/empty-state";
import { SelectMenu } from "@/components/ui/select-menu";
import { moveTask } from "@/app/projects/[id]/work/actions";
import { playSound } from "@/lib/sounds";
import {
  DUE_STATE_CLASSES,
  dueState,
  formatDueDate,
  isDone,
  normalizeTaskStatus,
  priorityDef,
  priorityDot,
  type BoardColumn,
  type PriorityDef,
} from "@/lib/work/task-board";
import { cn } from "@/lib/utils";
import type { Task, TaskStatus } from "@/types/task";

export interface MyTasksProject {
  id: string;
  name: string;
  color: string | null;
  columns: BoardColumn[];
  priorities: PriorityDef[];
}

type Group = "overdue" | "today" | "week" | "later" | "none";
const GROUP_ORDER: Group[] = ["overdue", "today", "week", "later", "none"];

/** YYYY-MM-DD of the viewer's local calendar day, `offset` days from today. */
function localDay(offset = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * due_date is stored as UTC midnight of the picked calendar day (lib/date.ts),
 * so its UTC date is that day - compared against the viewer's local today,
 * same calendar-day rule as dueState(). A Date when self-hosted (pg parses
 * timestamptz), a string from Supabase - new Date() takes either.
 */
function dueDay(task: Task): string {
  return task.due_date ? new Date(task.due_date).toISOString().slice(0, 10) : "";
}

function groupOf(task: Task, today: string, weekEnd: string): Group {
  if (!task.due_date) return "none";
  const day = dueDay(task);
  if (day < today) return "overdue";
  if (day === today) return "today";
  if (day <= weekEnd) return "week";
  return "later";
}

export function MyTasksList({
  initialTasks,
  projects,
}: {
  initialTasks: Task[];
  projects: Record<string, MyTasksProject>;
}) {
  const t = useTranslations("myTasks");
  const locale = useLocale();
  const [tasks, setTasks] = useState(initialTasks);

  const groups = useMemo(() => {
    const today = localDay();
    const weekEnd = localDay(7);
    const byGroup = new Map<Group, Task[]>(GROUP_ORDER.map((group) => [group, []]));
    for (const task of tasks) byGroup.get(groupOf(task, today, weekEnd))!.push(task);
    for (const list of byGroup.values()) {
      list.sort(
        (a, b) =>
          dueDay(a).localeCompare(dueDay(b)) ||
          priorityDef(a.priority, projects[a.project_id]?.priorities).rank -
            priorityDef(b.priority, projects[b.project_id]?.priorities).rank ||
          a.title.localeCompare(b.title)
      );
    }
    return GROUP_ORDER.map((group) => ({ group, tasks: byGroup.get(group)! })).filter((entry) => entry.tasks.length);
  }, [tasks, projects]);

  const setStatus = async (task: Task, status: TaskStatus) => {
    const previous = task.status;
    const columns = projects[task.project_id]?.columns;
    const nowDone = isDone(status, columns);
    if (nowDone && !isDone(previous, columns)) playSound("complete");
    setTasks((list) => list.map((item) => (item.id === task.id ? { ...item, status, is_done: nowDone } : item)));
    // The task's own sort_order: moveTask renumbers the target column if it collides.
    const result = await moveTask(task.project_id, task.id, status, task.sort_order ?? 0);
    if (result.error) {
      setTasks((list) => list.map((item) => (item.id === task.id ? { ...item, status: previous, is_done: task.is_done } : item)));
      playSound("error");
      toast.error(result.error);
    }
  };

  if (tasks.length === 0) {
    return <EmptyState icon={CheckCircle2} title={t("emptyTitle")} description={t("emptyDescription")} />;
  }

  return (
    <div className="space-y-6">
      {groups.map(({ group, tasks: groupTasks }) => (
        <section key={group} aria-labelledby={`my-tasks-${group}`}>
          <h2
            id={`my-tasks-${group}`}
            className={cn(
              "mb-2 flex items-center gap-2 text-sm font-medium",
              group === "overdue" ? "text-danger" : "text-muted-foreground"
            )}
          >
            {t(`group_${group}`)}
            <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">
              {groupTasks.length}
            </span>
          </h2>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {groupTasks.map((task) => {
              const project = projects[task.project_id];
              const status = normalizeTaskStatus(task.status);
              const done = isDone(status, project.columns);
              const due = dueState(task.due_date, task.status, done);
              const dot = priorityDot(task.priority, project.priorities);
              const options = project.columns.map((column) => ({ value: column.status, label: column.label }));
              if (!options.some((option) => option.value === status)) {
                options.push({ value: status, label: status });
              }
              return (
                <li key={task.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 sm:flex-nowrap">
                  <span
                    aria-hidden
                    className={cn("h-2 w-2 shrink-0 rounded-full", dot.className)}
                    style={dot.style}
                  />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/projects/${task.project_id}/work?openTask=${task.id}`}
                      className={cn(
                        "block truncate text-sm font-medium hover:underline",
                        done && "text-muted-foreground line-through"
                      )}
                      title={task.title}
                    >
                      {task.title}
                    </Link>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span
                        aria-hidden
                        className="h-1.5 w-1.5 rounded-full bg-muted-foreground"
                        style={project.color ? { backgroundColor: project.color } : undefined}
                      />
                      <span className="truncate">{project.name}</span>
                    </span>
                  </div>
                  {task.due_date && (
                    <span className={cn("shrink-0 text-xs tabular-nums", DUE_STATE_CLASSES[due])}>
                      {formatDueDate(task.due_date, locale)}
                    </span>
                  )}
                  <SelectMenu
                    aria-label={t("statusLabel", { task: task.title })}
                    value={status}
                    options={options}
                    onValueChange={(value) => setStatus(task, value as TaskStatus)}
                    className="h-8 w-36 shrink-0 text-xs"
                  />
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
