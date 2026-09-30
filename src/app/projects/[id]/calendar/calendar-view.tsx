"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TaskDetailDialog } from "@/components/work/task-detail-dialog";
import { loadTaskById } from "@/app/projects/[id]/work/relations-actions";
import type { TaskCardMember } from "@/components/work/task-card";
import { PRIORITY_DOT_CLASSES, normalizeTaskPriority } from "@/lib/work/task-board";
import { groupTasksByDay, monthKey, shiftMonth, type MonthGrid } from "@/lib/work/calendar";
import { cn } from "@/lib/utils";
import type { PhaseStatus, Task } from "@/types/task";

const WEEKDAY_INDEX = [1, 2, 3, 4, 5, 6, 0]; // Monday-first, matches buildMonthGrid
const MAX_PHASE_LANES = 3;

export interface CalendarPhase {
  id: string;
  name: string;
  status: PhaseStatus;
  /** YYYY-MM-DD, inclusive */
  start: string;
  /** YYYY-MM-DD, inclusive */
  end: string;
  lane: number;
}

const PHASE_BAR_CLASSES: Record<PhaseStatus, string> = {
  planned: "bg-info/15 text-info hover:bg-info/25",
  in_progress: "bg-warning/20 text-warning hover:bg-warning/30",
  completed: "bg-success/15 text-success hover:bg-success/25",
  blocked: "bg-danger/15 text-danger hover:bg-danger/25",
};

export function CalendarView({
  projectId,
  grid,
  initialTasks,
  phases,
  members,
  currentUserId,
  canEdit,
  canDelete,
  canComment,
}: {
  projectId: string;
  grid: MonthGrid;
  initialTasks: Task[];
  phases: CalendarPhase[];
  members: TaskCardMember[];
  currentUserId: string;
  canEdit: boolean;
  canDelete: boolean;
  canComment: boolean;
}) {
  const t = useTranslations("calendar");
  const locale = useLocale();
  const [tasks, setTasks] = useState(initialTasks);
  const [openTask, setOpenTask] = useState<Task | null>(null);

  const tasksByDay = useMemo(() => groupTasksByDay(tasks), [tasks]);
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const monthLabel = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(grid.year, grid.month, 1))),
    [locale, grid.year, grid.month]
  );
  const weekdayLabels = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
    // A Monday-first UTC week, any dates work as long as they land on the right weekday.
    return WEEKDAY_INDEX.map((_, i) => formatter.format(new Date(Date.UTC(2024, 0, 1 + i))));
  }, [locale]);

  const prev = shiftMonth(grid.year, grid.month, -1);
  const next = shiftMonth(grid.year, grid.month, 1);
  const currentMonth = monthKey(new Date().getUTCFullYear(), new Date().getUTCMonth());
  const thisMonth = monthKey(grid.year, grid.month);

  const upsertTask = (task: Task) => {
    setTasks((current) => {
      if (task.parent_task_id) return current; // a subtask save shouldn't add a card here
      const withoutDueDate = !task.due_date;
      if (withoutDueDate) return current.filter((existing) => existing.id !== task.id);
      const exists = current.some((existing) => existing.id === task.id);
      return exists
        ? current.map((existing) => (existing.id === task.id ? task : existing))
        : [...current, task];
    });
    setOpenTask(null);
  };

  const removeTask = (taskId: string) => {
    setTasks((current) => current.filter((existing) => existing.id !== taskId));
    setOpenTask(null);
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold capitalize">{monthLabel}</h2>
        <div className="flex items-center gap-1">
          <Button asChild variant="outline" size="sm">
            <Link href={`?month=${monthKey(prev.year, prev.month)}`} aria-label={t("previousMonth")}>
              <ChevronLeft className="h-4 w-4" />
            </Link>
          </Button>
          {thisMonth !== currentMonth && (
            <Button asChild variant="outline" size="sm">
              <Link href={`?month=${currentMonth}`}>{t("today")}</Link>
            </Button>
          )}
          <Button asChild variant="outline" size="sm">
            <Link href={`?month=${monthKey(next.year, next.month)}`} aria-label={t("nextMonth")}>
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-border bg-border text-xs font-medium text-muted-foreground">
        {weekdayLabels.map((label) => (
          <div key={label} className="bg-background-secondary px-2 py-1.5 text-center capitalize">
            {label}
          </div>
        ))}
      </div>

      <div
        className="grid grid-cols-7 gap-px overflow-hidden rounded-b-lg border border-t-0 border-border bg-border"
        style={{ gridTemplateRows: `repeat(${grid.weeks.length}, minmax(6rem, 1fr))` }}
      >
        {grid.weeks.flatMap((week) => {
          const weekPhases = phases.filter((phase) => phase.start <= week[6].iso && phase.end >= week[0].iso);
          // Every day in a week reserves the same number of lanes, so a
          // phase's bar stays at the same height from one day to the next.
          const laneCount = Math.min(MAX_PHASE_LANES, Math.max(0, ...weekPhases.map((phase) => phase.lane + 1)));
          return week.map((day, weekday) => {
            const dayTasks = tasksByDay.get(day.iso) ?? [];
            const isToday = day.iso === todayIso;
            const dayPhases = weekPhases.filter((phase) => phase.start <= day.iso && phase.end >= day.iso);
            const hiddenPhases = dayPhases.filter((phase) => phase.lane >= MAX_PHASE_LANES).length;
            return (
              <div
                key={day.iso}
                className={cn(
                  "flex min-h-24 flex-col gap-1 bg-card p-1.5",
                  !day.inMonth && "bg-background-secondary text-muted-foreground"
                )}
              >
                <span
                  className={cn(
                    "self-start rounded-full px-1.5 text-xs tabular-nums",
                    isToday && "bg-primary font-semibold text-primary-foreground"
                  )}
                >
                  {day.day}
                </span>
                {laneCount > 0 && (
                  <div className="-mx-1.5 space-y-0.5">
                    {Array.from({ length: laneCount }, (_, lane) => {
                      const phase = dayPhases.find((candidate) => candidate.lane === lane);
                      if (!phase) return <div key={lane} aria-hidden className="h-4" />;
                      const isStart = phase.start === day.iso;
                      const isEnd = phase.end === day.iso;
                      const showLabel = isStart || weekday === 0;
                      // The label spans every day of the bar left in this
                      // week, so a phase name isn't cut to one narrow cell.
                      const endInWeek = week.findIndex((weekDay) => weekDay.iso === phase.end);
                      const labelDays = (endInWeek === -1 ? 6 : endInWeek) - weekday + 1;
                      return (
                        <Link
                          key={lane}
                          href={`/projects/${projectId}/roadmap`}
                          title={phase.name}
                          aria-label={t("phaseAria", { name: phase.name })}
                          className={cn(
                            "relative block h-4 text-[10px] font-medium leading-4 transition-colors",
                            PHASE_BAR_CLASSES[phase.status],
                            isStart && "ml-1.5 rounded-l",
                            isEnd && "mr-1.5 rounded-r"
                          )}
                        >
                          {showLabel && (
                            <span
                              className="absolute inset-y-0 left-0 z-10 truncate px-1.5"
                              style={{ width: `calc(${labelDays * 100}% + ${labelDays - 1}px)` }}
                            >
                              {phase.name}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                    {hiddenPhases > 0 && (
                      <p className="px-2.5 text-[10px] text-muted-foreground">
                        {t("morePhases", { count: hiddenPhases })}
                      </p>
                    )}
                  </div>
                )}
                <ul className="space-y-0.5 overflow-hidden">
                  {dayTasks.slice(0, 4).map((task) => (
                    <li key={task.id}>
                      <button
                        type="button"
                        onClick={() => setOpenTask(task)}
                        className="flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[11px] hover:bg-surface-hover"
                        title={task.title}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "h-1.5 w-1.5 shrink-0 rounded-full",
                            PRIORITY_DOT_CLASSES[normalizeTaskPriority(task.priority)]
                          )}
                        />
                        <span className="truncate">{task.title}</span>
                      </button>
                    </li>
                  ))}
                  {dayTasks.length > 4 && (
                    <li className="px-1 text-[11px] text-muted-foreground">
                      {t("moreTasks", { count: dayTasks.length - 4 })}
                    </li>
                  )}
                </ul>
              </div>
            );
          });
        })}
      </div>

      {openTask && (
        <TaskDetailDialog
          key={openTask.id}
          projectId={projectId}
          task={openTask}
          subtasks={[]}
          members={members}
          canEdit={canEdit}
          canDelete={canDelete}
          canComment={canComment}
          currentUserId={currentUserId}
          onClose={() => setOpenTask(null)}
          onSaved={upsertTask}
          onDeleted={removeTask}
          onNavigateToTask={(taskId) => {
            const target = tasks.find((t) => t.id === taskId);
            if (target) {
              setOpenTask(target);
            } else {
              // Not in this month's grid - e.g. no due date, or a due date
              // outside the currently viewed month. Fetch it directly rather
              // than silently no-opping on click.
              void loadTaskById(projectId, taskId).then((result) => {
                if (result.task) setOpenTask(result.task);
              });
            }
          }}
        />
      )}
    </div>
  );
}
