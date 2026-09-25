"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { AlertCircle, Loader2, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { KanbanBoard } from "@/components/work/kanban-board";

// TaskDetailDialog (and the attempts/why-panel sections it always imports)
// only matter once a task is actually opened - code-split so the board's
// initial load doesn't pay for a dialog nobody may click into this visit.
const TaskDetailDialog = dynamic(() =>
  import("@/components/work/task-detail-dialog").then((mod) => mod.TaskDetailDialog)
);
import type { TaskCardMember } from "@/components/work/task-card";
import {
  BOARD_COLUMNS,
  TASK_PRIORITIES,
  boardProgress,
  groupSubtasksByParent,
  normalizeTaskPriority,
  normalizeTaskStatus,
  subtaskProgress,
  type BoardColumn,
} from "@/lib/work/task-board";
import { createTask, moveTask } from "./actions";
import { AiTaskChat } from "./ai-task-chat";
import type { Task, TaskPriority, TaskStatus } from "@/types/task";
import type { ProjectRole } from "@/types/project";

interface WorkState {
  tasks: Task[];
  commentCounts: Record<string, number>;
  coverImages: Record<string, string>;
}

export function WorkBoard({
  projectId,
  projectName,
  userId,
  role,
  canWrite,
  canComment,
  initialTasks,
  members,
  initialCommentCounts,
  initialCoverImages,
  projectColor,
  columns = BOARD_COLUMNS,
  aiAvailable = false,
}: {
  projectId: string;
  projectName: string;
  userId: string;
  role: ProjectRole | null;
  canWrite: boolean;
  canComment: boolean;
  initialTasks: Task[];
  members: TaskCardMember[];
  initialCommentCounts: Record<string, number>;
  initialCoverImages?: Record<string, string>;
  projectColor?: string;
  columns?: readonly BoardColumn[];
  aiAvailable?: boolean;
}) {
  const t = useTranslations("work");
  const canDelete = role === "owner" || role === "admin";
  const canEdit = canWrite;

  const [state, setState] = useState<WorkState>({
    tasks: initialTasks,
    commentCounts: initialCommentCounts,
    coverImages: initialCoverImages ?? {},
  });
  const [error, setError] = useState<string | null>(null);
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [createFor, setCreateFor] = useState<TaskStatus | null>(null);
  // View-only preference, not persisted - resets to "manual" on reload/
  // navigation. See KanbanBoard's sortMode prop doc comment for why
  // dragging is disabled while sorted by due date.
  const [sortMode, setSortMode] = useState<"manual" | "due_date">("manual");
  // Quick filters, also view-only and not persisted. "all" means the
  // filter isn't restricting anything - AND-combined with the other two.
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");

  // Subtasks (migration 010) are plain rows in `tasks` with a parent_task_id.
  // They are not shown as their own board cards - only nested under their
  // parent in TaskDetailDialog and rolled up into the "3/5" badge on the
  // parent's card - so the board columns and progress header only count
  // top-level tasks.
  const topLevelTasks = useMemo(
    () => state.tasks.filter((task) => !task.parent_task_id),
    [state.tasks]
  );
  const subtasksByParent = useMemo(
    () => groupSubtasksByParent(state.tasks),
    [state.tasks]
  );
  const subtaskCounts = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(subtasksByParent).map(([taskId, subtasks]) => [
          taskId,
          subtaskProgress(subtasks),
        ])
      ),
    [subtasksByParent]
  );

  const progress = useMemo(() => boardProgress(topLevelTasks), [topLevelTasks]);

  // Tag options come from the full unfiltered set, so the dropdown's
  // choices stay stable while assignee/priority filters are active rather
  // than shrinking as other filters narrow things down.
  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    for (const task of topLevelTasks) {
      for (const tag of task.tags ?? []) tags.add(tag);
    }
    return Array.from(tags).sort();
  }, [topLevelTasks]);

  const filtersActive =
    assigneeFilter !== "all" || priorityFilter !== "all" || tagFilter !== "all";

  const filteredTasks = useMemo(() => {
    return topLevelTasks.filter((task) => {
      if (assigneeFilter !== "all" && task.assignee_id !== assigneeFilter) {
        return false;
      }
      if (
        priorityFilter !== "all" &&
        normalizeTaskPriority(task.priority) !== priorityFilter
      ) {
        return false;
      }
      if (tagFilter !== "all" && !(task.tags ?? []).includes(tagFilter)) {
        return false;
      }
      return true;
    });
  }, [topLevelTasks, assigneeFilter, priorityFilter, tagFilter]);

  const handleMove = async (task: Task, status: TaskStatus, sortOrder: number) => {
    const previousStatus = task.status;
    const previousSortOrder = task.sort_order;

    // Optimistic: the board should feel instant on drop.
    setState((current) => ({
      ...current,
      tasks: current.tasks.map((item) =>
        item.id === task.id ? { ...item, status, sort_order: sortOrder } : item
      ),
    }));

    const result = await moveTask(projectId, task.id, status, sortOrder);
    if (result.error) {
      // Roll back only this task's fields, not the whole tasks array as a
      // snapshot taken at the start of this call - restoring the full
      // snapshot would also discard any *other* move that was optimistically
      // applied and already succeeded in between (two drags/reorders fired
      // in quick succession, or a slow request resolving after a faster
      // later one), leaving a card showing the wrong column until reload.
      setState((current) => ({
        ...current,
        tasks: current.tasks.map((item) =>
          item.id === task.id
            ? { ...item, status: previousStatus, sort_order: previousSortOrder }
            : item
        ),
      }));
      setError(result.error);
    }
  };

  const upsertTask = (task: Task) =>
    setState((current) => ({
      ...current,
      tasks: current.tasks.some((item) => item.id === task.id)
        ? current.tasks.map((item) => (item.id === task.id ? task : item))
        : [...current.tasks, task],
    }));

  const removeTask = (taskId: string) =>
    setState((current) => ({
      ...current,
      tasks: current.tasks.filter((item) => item.id !== taskId),
    }));

  return (
    <>
      <div className="mx-auto max-w-[1600px] p-6">
        <header className="mb-6 flex flex-wrap items-end gap-4">
          <div className="flex-1">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">{t("title")}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {projectName}
              {progress.total > 0 && (
                <>
                  {" · "}
                  <span className="tabular-nums">
                    {t("progressDone", { done: progress.done, total: progress.total, percent: progress.percent })}
                  </span>
                  {progress.inFlight > 0 && (
                    <>
                      {" · "}
                      <span className="tabular-nums">{t("progressInFlight", { count: progress.inFlight })}</span>
                    </>
                  )}
                </>
              )}
            </p>
          </div>

          <Select
            aria-label={t("sortBy")}
            className="h-8 w-40"
            value={sortMode}
            onChange={(event) =>
              setSortMode(event.target.value as "manual" | "due_date")
            }
          >
            <option value="manual">{t("sortManual")}</option>
            <option value="due_date">{t("sortDueDate")}</option>
          </Select>

          {canEdit && aiAvailable && (
            <AiTaskChat
              projectId={projectId}
              projectName={projectName}
              topLevelTasks={topLevelTasks}
              onCreated={upsertTask}
            />
          )}

          {canEdit && (
            <Button
              size="sm"
              onClick={() => setCreateFor(columns[0]?.status ?? "todo")}
              style={projectColor ? { backgroundColor: projectColor } : undefined}
            >
              <Plus className="h-4 w-4" />
              {t("newTask")}
            </Button>
          )}
        </header>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Select
            aria-label={t("filterByAssignee")}
            className="h-8 w-40"
            value={assigneeFilter}
            onChange={(event) => setAssigneeFilter(event.target.value)}
          >
            <option value="all">{t("allAssignees")}</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.full_name || member.email}
              </option>
            ))}
          </Select>

          <Select
            aria-label={t("filterByPriority")}
            className="h-8 w-40"
            value={priorityFilter}
            onChange={(event) => setPriorityFilter(event.target.value)}
          >
            <option value="all">{t("allPriorities")}</option>
            {TASK_PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {t("priority", { priority: value })}
              </option>
            ))}
          </Select>

          <Select
            aria-label={t("filterByTag")}
            className="h-8 w-40"
            value={tagFilter}
            onChange={(event) => setTagFilter(event.target.value)}
          >
            <option value="all">{t("allTags")}</option>
            {availableTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </Select>

          {filtersActive && (
            <button
              type="button"
              onClick={() => {
                setAssigneeFilter("all");
                setPriorityFilter("all");
                setTagFilter("all");
              }}
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              {t("clearFilters")}
            </button>
          )}
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1">{error}</span>
            <button type="button" onClick={() => setError(null)} className="underline underline-offset-2">
              {t("dismiss")}
            </button>
          </div>
        )}

        {!canEdit && role && (
          <p className="mb-4 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
            {t.rich("readOnlyAccess", { role, b: (chunks) => <strong className="font-medium">{chunks}</strong> })}
          </p>
        )}

        {topLevelTasks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-16 text-center">
            <h2 className="text-sm font-medium text-foreground">{t("noTasksTitle")}</h2>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              {canEdit ? t("noTasksDescCanEdit") : t("noTasksDescReadOnly")}
            </p>
            {canEdit && (
              <Button size="sm" className="mt-4" onClick={() => setCreateFor(columns[0]?.status ?? "todo")}>
                <Plus className="h-4 w-4" />
                {t("newTask")}
              </Button>
            )}
          </div>
        ) : (
          <KanbanBoard
            tasks={filteredTasks}
            members={members}
            commentCounts={state.commentCounts}
            coverImages={state.coverImages}
            subtaskCounts={subtaskCounts}
            columns={columns}
            canEdit={canEdit}
            sortMode={sortMode}
            filtersActive={filtersActive}
            onOpenTask={setOpenTask}
            onCreateTask={setCreateFor}
            onMoveTask={handleMove}
            projectColor={projectColor}
          />
        )}
      </div>

      {openTask && (
        <TaskDetailDialog
          key={openTask.id}
          projectId={projectId}
          task={openTask}
          subtasks={subtasksByParent[openTask.id] ?? []}
          members={members}
          canEdit={canEdit}
          canDelete={canDelete}
          canComment={canComment}
          currentUserId={userId}
          columns={columns}
          onClose={() => setOpenTask(null)}
          onSaved={upsertTask}
          onDeleted={removeTask}
          onNavigateToTask={(taskId) => {
            const target = state.tasks.find((t) => t.id === taskId);
            if (target) setOpenTask(target);
          }}
        />
      )}

      <CreateTaskDialog
        key={createFor ?? "no-column"}
        projectId={projectId}
        status={createFor}
        members={members}
        currentUserId={userId}
        existingTasks={topLevelTasks}
        columns={columns}
        onClose={() => setCreateFor(null)}
        onCreated={upsertTask}
      />
    </>
  );
}

// ============================================
// CREATE TASK
// ============================================

function CreateTaskDialog({
  projectId,
  status,
  members,
  currentUserId,
  existingTasks,
  columns,
  onClose,
  onCreated,
}: {
  projectId: string;
  status: TaskStatus | null;
  members: TaskCardMember[];
  currentUserId: string | null;
  existingTasks: Task[];
  columns: readonly BoardColumn[];
  onClose: () => void;
  onCreated: (task: Task) => void;
}) {
  const t = useTranslations("work");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The parent keys this component by target column, so opening the dialog
  // for a different column remounts it with a clean form.
  if (!status) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentUserId) return;

    setSubmitting(true);
    setError(null);

    try {
      const columnTasks = existingTasks.filter(
        (task) => normalizeTaskStatus(task.status) === status
      );
      const maxOrder = columnTasks.reduce((max, task) => Math.max(max, task.sort_order ?? 0), 0);

      const result = await createTask(projectId, {
        title,
        description,
        status,
        priority,
        assigneeId,
        dueDate,
        sortOrder: maxOrder + 100,
      });

      if (result.error || !result.task) throw new Error(result.error ?? t("failedToCreateTask"));

      onCreated(result.task);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failedToCreateTask"));
    } finally {
      setSubmitting(false);
    }
  };

  const columnLabel = columns.find((column) => column.status === status)?.label ?? status;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">{t("newTaskDialogTitle")}</DialogTitle>
          <DialogDescription>
            {t.rich("addedToColumn", { column: columnLabel, b: (chunks) => <strong>{chunks}</strong> })}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-task-title">{t("titleLabel")}</Label>
            <Input
              id="new-task-title"
              value={title}
              required
              autoFocus
              placeholder={t("titlePlaceholder")}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-task-description">{t("descriptionLabel")}</Label>
            <Textarea
              id="new-task-description"
              rows={3}
              value={description}
              placeholder={t("descriptionPlaceholderTask")}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="new-task-priority">{t("priorityLabel")}</Label>
              <Select
                id="new-task-priority"
                value={priority}
                onChange={(event) => setPriority(event.target.value as TaskPriority)}
              >
                {TASK_PRIORITIES.map((value) => (
                  <option key={value} value={value}>
                    {t("priority", { priority: value })}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-task-assignee">{t("assigneeLabel")}</Label>
              <Select
                id="new-task-assignee"
                value={assigneeId}
                onChange={(event) => setAssigneeId(event.target.value)}
              >
                <option value="">{t("unassigned")}</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.full_name || member.email}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-task-due">{t("dueDateLabel")}</Label>
              <Input
                id="new-task-due"
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </div>
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={submitting}>
              {t("cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={submitting || !title.trim()}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("createTask")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
