"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronRight, Loader2, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TaskDetailDialog } from "@/components/work/task-detail-dialog";
import { initialsFor, type TaskCardMember } from "@/components/work/task-card";
import { createTask, moveTask } from "@/app/projects/[id]/work/actions";
import { loadTaskById } from "@/app/projects/[id]/work/relations-actions";
import {
  DUE_STATE_CLASSES,
  PRIORITY_DOT_CLASSES,
  dueState,
  formatDueDate,
  normalizeTaskPriority,
  normalizeTaskStatus,
  type BoardColumn,
} from "@/lib/work/task-board";
import { cn } from "@/lib/utils";
import type { Task, TaskStatus } from "@/types/task";
import { MINI_FILTER_COOKIE, MINI_PROJECT_COOKIE } from "./mini-cookies";

export interface MiniProject {
  id: string;
  name: string;
  color: string | null;
}

export type MiniFilter = "mine" | "all";

const REFRESH_INTERVAL_MS = 60_000;

/** Cookies rather than localStorage so the server renders the remembered view directly. */
function rememberInCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/mini; max-age=31536000; samesite=lax`;
}

/** Places a task at the end of `status`'s column. */
function endOfColumnSortOrder(tasks: Task[], status: TaskStatus, exceptId?: string): number {
  const orders = tasks
    .filter((task) => !task.parent_task_id && task.id !== exceptId && normalizeTaskStatus(task.status) === status)
    .map((task) => task.sort_order ?? 0);
  return orders.length === 0 ? 1000 : Math.max(...orders) + 100;
}

export function MiniTasks({
  projects,
  projectId,
  initialFilter,
  userId,
  canWrite,
  canComment,
  canDelete,
  aiEnabled,
  initialTasks,
  members,
  columns,
}: {
  projects: MiniProject[];
  projectId: string;
  initialFilter: MiniFilter;
  userId: string;
  canWrite: boolean;
  canComment: boolean;
  canDelete: boolean;
  aiEnabled: boolean;
  initialTasks: Task[];
  members: TaskCardMember[];
  columns: BoardColumn[];
}) {
  const t = useTranslations("mini");
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [tasks, setTasks] = useState(initialTasks);
  const [syncedFrom, setSyncedFrom] = useState(initialTasks);
  const [filter, setFilter] = useState<MiniFilter>(initialFilter);
  const [showDone, setShowDone] = useState(false);
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A router.refresh() brings new server data; take it over local state.
  if (initialTasks !== syncedFrom) {
    setSyncedFrom(initialTasks);
    setTasks(initialTasks);
  }

  useEffect(() => {
    rememberInCookie(MINI_PROJECT_COOKIE, projectId);
  }, [projectId]);

  const refresh = useCallback(() => startRefresh(() => router.refresh()), [router]);

  // The window sits in a corner for hours; pick up teammates' changes when
  // it comes back into view, and every minute while visible.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    const interval = window.setInterval(onVisible, REFRESH_INTERVAL_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.clearInterval(interval);
    };
  }, [refresh]);

  const membersById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);
  const doneColumn = columns.find((column) => column.status === "done");
  const openColumns = columns.filter((column) => column.status !== "done");
  const defaultNewStatus: TaskStatus =
    openColumns.find((column) => column.status === "todo")?.status ?? openColumns[0]?.status ?? "todo";

  const visible = useMemo(
    () => tasks.filter((task) => !task.parent_task_id && (filter === "all" || task.assignee_id === userId)),
    [tasks, filter, userId]
  );
  const byStatus = useMemo(() => {
    const groups = new Map<TaskStatus, Task[]>();
    for (const task of visible) {
      const status = normalizeTaskStatus(task.status);
      groups.set(status, [...(groups.get(status) ?? []), task]);
    }
    return groups;
  }, [visible]);

  const upsert = (task: Task) =>
    setTasks((current) =>
      current.some((existing) => existing.id === task.id)
        ? current.map((existing) => (existing.id === task.id ? task : existing))
        : [...current, task]
    );

  const handleAdd = async (event: React.FormEvent) => {
    event.preventDefault();
    const title = newTitle.trim();
    if (!title || adding) return;
    setAdding(true);
    setError(null);
    const result = await createTask(projectId, {
      title,
      description: "",
      status: defaultNewStatus,
      priority: "medium",
      assigneeId: filter === "mine" ? userId : "",
      dueDate: "",
      sortOrder: endOfColumnSortOrder(tasks, defaultNewStatus),
    });
    setAdding(false);
    if (result.error || !result.task) {
      setError(result.error ?? t("addFailed"));
      return;
    }
    upsert(result.task);
    setNewTitle("");
  };

  const handleMove = async (task: Task, status: TaskStatus) => {
    const previous = task;
    const sortOrder = endOfColumnSortOrder(tasks, status, task.id);
    upsert({ ...task, status, sort_order: sortOrder });
    setError(null);
    const result = await moveTask(projectId, task.id, status, sortOrder);
    if (result.error) {
      upsert(previous);
      setError(result.error);
    }
  };

  const renderTask = (task: Task) => {
    const priority = normalizeTaskPriority(task.priority);
    const due = dueState(task.due_date, task.status);
    const assignee = task.assignee_id ? membersById.get(task.assignee_id) : undefined;
    const status = normalizeTaskStatus(task.status);
    return (
      <li key={task.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-surface-hover">
        <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", PRIORITY_DOT_CLASSES[priority])} />
        <button
          type="button"
          onClick={() => setOpenTask(task)}
          className={cn(
            "min-w-0 flex-1 truncate text-left text-sm",
            status === "done" && "text-muted-foreground line-through"
          )}
          title={task.title}
        >
          {task.title}
        </button>
        {task.due_date && due !== "none" && (
          <span className={cn("shrink-0 text-[11px] tabular-nums", DUE_STATE_CLASSES[due])}>{formatDueDate(task.due_date)}</span>
        )}
        {filter === "all" && assignee && (
          <span
            title={assignee.full_name || assignee.email}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-medium text-secondary-foreground"
          >
            {initialsFor(assignee)}
          </span>
        )}
        {canWrite && (
          <Select
            aria-label={t("statusAria", { title: task.title })}
            value={status}
            onChange={(event) => void handleMove(task, event.target.value as TaskStatus)}
            className="h-7 w-auto max-w-28 shrink-0 py-0 pl-2 pr-7 text-xs"
          >
            {columns.map((column) => (
              <option key={column.status} value={column.status}>
                {column.label}
              </option>
            ))}
          </Select>
        )}
      </li>
    );
  };

  const doneTasks = doneColumn ? byStatus.get("done") ?? [] : [];

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex shrink-0 items-center gap-2 border-b border-border p-2">
        <Select
          aria-label={t("projectAria")}
          value={projectId}
          onChange={(event) => router.push(`/mini?project=${event.target.value}`)}
          className="h-8 min-w-0 flex-1 text-sm"
        >
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </Select>
        <div role="group" aria-label={t("filterAria")} className="flex shrink-0 rounded-md border border-border p-0.5 text-xs">
          {(["mine", "all"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => {
                setFilter(value);
                rememberInCookie(MINI_FILTER_COOKIE, value);
              }}
              className={cn(
                "rounded px-2 py-1",
                filter === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {value === "mine" ? t("filterMine") : t("filterAll")}
            </button>
          ))}
        </div>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={refresh} aria-label={t("refresh")}>
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
        </Button>
      </header>

      {canWrite && (
        <form onSubmit={handleAdd} className="flex shrink-0 gap-2 border-b border-border p-2">
          <Input
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            placeholder={filter === "mine" ? t("addPlaceholderMine") : t("addPlaceholder")}
            aria-label={t("addPlaceholder")}
            className="h-8 text-sm"
            maxLength={500}
          />
          <Button type="submit" size="icon" className="h-8 w-8 shrink-0" disabled={adding || !newTitle.trim()} aria-label={t("add")}>
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </Button>
        </form>
      )}

      {error && (
        <p role="alert" className="shrink-0 border-b border-border bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
          {error}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {openColumns.every((column) => (byStatus.get(column.status) ?? []).length === 0) && (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            {filter === "mine" ? t("emptyMine") : t("empty")}
          </p>
        )}

        {openColumns.map((column) => {
          const columnTasks = byStatus.get(column.status) ?? [];
          if (columnTasks.length === 0) return null;
          return (
            <section key={column.status}>
              <h2 className="sticky top-0 z-10 flex items-center gap-2 bg-background-secondary px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", column.accentClass)} />
                {column.label}
                <span className="tabular-nums">{columnTasks.length}</span>
              </h2>
              <ul>{columnTasks.map(renderTask)}</ul>
            </section>
          );
        })}

        {doneColumn && doneTasks.length > 0 && (
          <section>
            <button
              type="button"
              onClick={() => setShowDone((value) => !value)}
              aria-expanded={showDone}
              className="sticky top-0 z-10 flex w-full items-center gap-2 bg-background-secondary px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
            >
              {showDone ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              {doneColumn.label}
              <span className="tabular-nums">{doneTasks.length}</span>
            </button>
            {showDone && <ul>{doneTasks.map(renderTask)}</ul>}
          </section>
        )}
      </div>

      {openTask && (
        <TaskDetailDialog
          key={openTask.id}
          projectId={projectId}
          task={openTask}
          subtasks={tasks.filter((task) => task.parent_task_id === openTask.id)}
          members={members}
          canEdit={canWrite}
          canDelete={canDelete}
          canComment={canComment}
          currentUserId={userId}
          columns={columns}
          aiEnabled={aiEnabled}
          onClose={() => setOpenTask(null)}
          onSaved={(task) => {
            upsert(task);
            if (!task.parent_task_id) setOpenTask(null);
          }}
          onDeleted={(taskId) => {
            setTasks((current) => current.filter((task) => task.id !== taskId && task.parent_task_id !== taskId));
            setOpenTask(null);
          }}
          onNavigateToTask={(taskId) => {
            const target = tasks.find((task) => task.id === taskId);
            if (target) {
              setOpenTask(target);
              return;
            }
            void loadTaskById(projectId, taskId).then((result) => {
              if (result.task) setOpenTask(result.task);
            });
          }}
        />
      )}
    </div>
  );
}
