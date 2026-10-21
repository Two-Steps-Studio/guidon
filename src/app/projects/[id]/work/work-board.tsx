"use client";

import { LabelPresetsProvider } from "@/components/work/label-presets-context";
import { WorkflowProvider } from "@/components/work/workflow-context";
import type { LabelPreset } from "@/lib/work/label-presets";
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Upload, X } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { KanbanBoard } from "@/components/work/kanban-board";
import { isTypingTarget } from "@/components/layout/keyboard-shortcuts";

// TaskDetailDialog (and the attempts/why-panel sections it always imports)
// only matter once a task is actually opened - code-split so the board's
// initial load doesn't pay for a dialog nobody may click into this visit.
const TaskDetailDialog = dynamic(() =>
  import("@/components/work/task-detail-dialog").then((mod) => mod.TaskDetailDialog)
);
import type { TaskCardMember } from "@/components/work/task-card";
import {
  BOARD_COLUMNS,
  boardProgress,
  groupSubtasksByParent,
  isDone,
  normalizeTaskPriority,
  normalizeTaskStatus,
  subtaskProgress,
  type BoardColumn,
  type PriorityDef,
} from "@/lib/work/task-board";
import { createTask, moveTask } from "./actions";
import { toolResult, useWebMcpTools } from "@/components/agent/web-mcp";
import { playSound } from "@/lib/sounds";
import { CreateTaskDialog } from "./create-task-dialog";
import { ImportTasksDialog } from "./import-tasks-dialog";
import { bulkUpdateTasks, type BulkOperation } from "./bulk-actions";
import { BulkBar } from "./bulk-bar";
import { AiTaskChat } from "./ai-task-chat";
import type { Task, TaskStatus } from "@/types/task";
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
  aiEnabled = true,
  labelPresets = [],
  priorities,
  welcome = false,
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
  /** projects.ai_enabled (migration 046) - hides agent-only UI in the task dialog. */
  aiEnabled?: boolean;
  /** Project label presets (migration 053) - coloured labels and one-tap picks in the task dialog. */
  labelPresets?: LabelPreset[];
  /** The project's priorities in importance order (resolvePriorities). */
  priorities: PriorityDef[];
  /** Just created through onboarding - show the first-steps card. */
  welcome?: boolean;
}) {
  const t = useTranslations("work");
  const canDelete = role === "owner" || role === "admin";
  const canEdit = canWrite;

  const [state, setState] = useState<WorkState>({
    tasks: initialTasks,
    commentCounts: initialCommentCounts,
    coverImages: initialCoverImages ?? {},
  });
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [createFor, setCreateFor] = useState<TaskStatus | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [showWelcome, setShowWelcome] = useState(welcome);
  const tOnboarding = useTranslations("onboarding");

  // Deep link from the command palette (command-palette.tsx's resultHref) -
  // `?openTask=<id>` opens that task's detail dialog on arrival, same as
  // clicking its card would. Stripped from the URL right after so a
  // refresh doesn't reopen it and the address bar doesn't look stale.
  const router = useRouter();
  const searchParams = useSearchParams();
  const openTaskParam = searchParams.get("openTask");
  useEffect(() => {
    if (!openTaskParam) return;
    const task = state.tasks.find((item) => item.id === openTaskParam);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (task) setOpenTask(task);
    router.replace(`/projects/${projectId}/work`, { scroll: false });
    // Fires per new ?openTask= value - also when a pinned task in the
    // sidebar is clicked while this board is already open - but not on
    // every state.tasks update (which would refire a stale lookup).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTaskParam]);
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
          subtaskProgress(subtasks, columns),
        ])
      ),
    [subtasksByParent, columns]
  );

  const progress = useMemo(() => boardProgress(topLevelTasks, columns), [topLevelTasks, columns]);

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

  // Bulk selection (Ctrl/Cmd/Shift-click on cards). Only cards the current
  // filters show count - a hidden card is never changed by surprise.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const selectedTasks = useMemo(
    () => filteredTasks.filter((task) => selectedIds.has(task.id)),
    [filteredTasks, selectedIds]
  );
  const bulkLabels = useMemo(
    () => Array.from(new Set([...labelPresets.map((preset) => preset.name), ...availableTags])).sort(),
    [labelPresets, availableTags]
  );
  useEffect(() => {
    if (selectedIds.size === 0) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedIds(new Set());
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedIds.size]);

  // "N" opens the new-task dialog in the first column (keyboard-shortcuts.tsx
  // lists it) - not while typing or while another dialog is open.
  useEffect(() => {
    if (!canEdit) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "n" || event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return;
      if (isTypingTarget(event.target) || document.querySelector('[role="dialog"]')) return;
      event.preventDefault();
      setCreateFor(columns[0]?.status ?? "todo");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canEdit, columns]);

  const handleBulk = async (operation: BulkOperation) => {
    // Board order (column, then position), so moved cards keep their relative order.
    const columnIndex = new Map(columns.map((column, index) => [column.status, index]));
    const ids = selectedTasks
      .slice()
      .sort(
        (a, b) =>
          (columnIndex.get(normalizeTaskStatus(a.status)) ?? 0) - (columnIndex.get(normalizeTaskStatus(b.status)) ?? 0) ||
          (a.sort_order ?? 0) - (b.sort_order ?? 0)
      )
      .map((task) => task.id);
    const result = await bulkUpdateTasks(projectId, ids, operation);
    if (result.error) {
      playSound("error");
      toast.error(result.error);
      return;
    }
    if (operation.kind === "move" && isDone(operation.status, columns)) playSound("complete");
    const chosen = new Set(ids);
    setState((current) => {
      if (operation.kind === "delete") {
        // Subtasks of a deleted card go with it (ON DELETE CASCADE).
        return {
          ...current,
          tasks: current.tasks.filter((task) => !chosen.has(task.id) && !chosen.has(task.parent_task_id ?? "")),
        };
      }
      const lastOrder = Math.max(0, ...current.tasks.map((task) => task.sort_order ?? 0));
      const position = new Map(ids.map((id, index) => [id, index + 1]));
      return {
        ...current,
        tasks: current.tasks.map((task) => {
          if (!chosen.has(task.id)) return task;
          switch (operation.kind) {
            case "move":
              return {
                ...task,
                status: operation.status,
                is_done: isDone(operation.status, columns),
                sort_order: lastOrder + (position.get(task.id) ?? 0) * 1000,
              };
            case "assign":
              return { ...task, assignee_id: operation.assigneeId };
            case "label": {
              const tags = task.tags ?? [];
              return {
                ...task,
                tags: operation.add
                  ? tags.includes(operation.label) ? tags : [...tags, operation.label]
                  : tags.filter((tag) => tag !== operation.label),
              };
            }
            default:
              return task;
          }
        }),
      };
    });
    toast.success(t("bulkDone", { count: result.count }));
    if (operation.kind === "delete") setSelectedIds(new Set());
  };

  const handleMove = async (task: Task, status: TaskStatus, sortOrder: number) => {
    const previousStatus = task.status;
    const previousSortOrder = task.sort_order;

    // Optimistic: the board should feel instant on drop - the sound too.
    if (isDone(status, columns) && !isDone(previousStatus, columns)) playSound("complete");
    setState((current) => ({
      ...current,
      tasks: current.tasks.map((item) =>
        item.id === task.id ? { ...item, status, sort_order: sortOrder, is_done: isDone(status, columns) } : item
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
            ? { ...item, status: previousStatus, sort_order: previousSortOrder, is_done: task.is_done }
            : item
        ),
      }));
      playSound("error");
      toast.error(result.error);
    }
    // A repeating task was finished: its next occurrence joins the board.
    result.created?.forEach(upsertTask);
  };

  const upsertTask = (task: Task) =>
    setState((current) => ({
      ...current,
      tasks: current.tasks.some((item) => item.id === task.id)
        ? current.tasks.map((item) => (item.id === task.id ? task : item))
        : [...current.tasks, task],
    }));

  // WebMCP: a browser agent working in this tab can read and change the
  // board as the person - through the same actions (and permissions) as
  // the UI, with the same optimistic updates.
  useWebMcpTools([
    {
      name: "list_board_tasks",
      title: "List tasks on this board",
      description: `The tasks on the open Guidon board (${projectName}): id, title, column, priority, due date. Columns: ${columns.map((column) => column.status).join(", ")}.`,
      annotations: { readOnlyHint: true },
      execute: () => {
        const tasks = state.tasks
          .filter((task) => !task.parent_task_id)
          .map((task) => ({ id: task.id, title: task.title, status: task.status, priority: task.priority, due_date: task.due_date ?? null }));
        return toolResult(tasks.map((task) => `${task.id} [${task.status}] ${task.title}`).join("\n") || "The board is empty.", { tasks });
      },
    },
    ...(canEdit
      ? [
          {
            name: "create_board_task",
            title: "Create a task on this board",
            description: `Create a task on the open Guidon board (${projectName}).`,
            inputSchema: {
              type: "object",
              properties: {
                title: { type: "string" },
                description: { type: "string" },
                status: { type: "string", enum: columns.map((column) => column.status), description: "Column; defaults to the first." },
                priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
              },
              required: ["title"],
            },
            execute: async (input: Record<string, unknown>) => {
              const status = (columns.some((column) => column.status === input.status) ? input.status : columns[0]?.status ?? "todo") as TaskStatus;
              const result = await createTask(projectId, {
                title: String(input.title ?? ""),
                description: typeof input.description === "string" ? input.description : "",
                status,
                priority: (["low", "medium", "high", "urgent"].includes(String(input.priority)) ? input.priority : "medium") as Task["priority"],
                assigneeId: "",
                dueDate: "",
                sortOrder: Math.max(0, ...state.tasks.map((task) => task.sort_order ?? 0)) + 1000,
              });
              if (result.error || !result.task) return toolResult(result.error ?? "The task wasn't created.");
              upsertTask(result.task);
              return toolResult(`Created "${result.task.title}" (${result.task.id}) in ${status}.`, { task: result.task });
            },
          },
          {
            name: "move_board_task",
            title: "Move a task to another column",
            description: "Move a task on the open board to another column (to the bottom of it).",
            inputSchema: {
              type: "object",
              properties: { task_id: { type: "string" }, status: { type: "string", enum: columns.map((column) => column.status) } },
              required: ["task_id", "status"],
            },
            execute: async (input: Record<string, unknown>) => {
              const task = state.tasks.find((item) => item.id === input.task_id);
              const status = columns.find((column) => column.status === input.status)?.status;
              if (!task || !status) return toolResult("Unknown task or column - call list_board_tasks first.");
              await handleMove(task, status, Math.max(0, ...state.tasks.map((item) => item.sort_order ?? 0)) + 1000);
              return toolResult(`Moved "${task.title}" to ${status}.`);
            },
          },
        ]
      : []),
  ]);

  const removeTask = (taskId: string) =>
    setState((current) => ({
      ...current,
      tasks: current.tasks.filter((item) => item.id !== taskId),
    }));

  return (
    <WorkflowProvider value={{ columns, priorities }}>
    <LabelPresetsProvider value={labelPresets}>
      {/* w-full (not just mx-auto + max-w): this page is a flex item of
          <main> (app-sidebar's layout, flex-col with the default
          align-items:stretch) - but auto margins on a flex item's cross
          axis override stretch, sizing it to fit-content instead. With a
          kanban board wide enough to need its own internal horizontal
          scroll (overflow-x-auto below), that fit-content width grew this
          whole wrapper past the viewport, so the entire page scrolled
          horizontally (sidebar included) instead of just the board.
          min-w-0 additionally guards the same board's overflow-x-auto
          against the flex-item min-width:auto default.
          From md up the page is exactly one screen below the app header
          (h-12): the board takes what the header and filters leave and its
          columns scroll inside, so the page itself never scrolls away under
          the board. data-fills-viewport also hides the site footer here
          (globals.css). */}
      <div
        data-fills-viewport
        className="mx-auto min-w-0 w-full max-w-[1600px] p-6 md:flex md:h-[calc(100svh-3rem)] md:flex-col md:overflow-hidden"
      >
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
            className="h-8 w-40 shrink-0"
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
            <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4" />
              {t("importButton")}
            </Button>
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

        {showWelcome && canEdit && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{tOnboarding("welcomeTitle")}</p>
              <p className="text-xs text-muted-foreground">{tOnboarding("welcomeDescription")}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => setCreateFor(columns[0]?.status ?? "todo")}>
                <Plus className="h-4 w-4" />
                {tOnboarding("welcomeFirstTask")}
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link href={`/projects/${projectId}/members`}>{tOnboarding("welcomeInvite")}</Link>
              </Button>
              <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4" />
                {tOnboarding("welcomeImport")}
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={tOnboarding("welcomeDismiss")} onClick={() => setShowWelcome(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* One swipeable row on a phone instead of three stacked full-width filters above the board. */}
        <div className="-mx-1 mb-4 flex items-center gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
          <Select
            aria-label={t("filterByAssignee")}
            className="h-8 w-40 shrink-0"
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
            className="h-8 w-40 shrink-0"
            value={priorityFilter}
            onChange={(event) => setPriorityFilter(event.target.value)}
          >
            <option value="all">{t("allPriorities")}</option>
            {priorities.map((priority) => (
              <option key={priority.key} value={priority.key}>
                {priority.label}
              </option>
            ))}
          </Select>

          <Select
            aria-label={t("filterByTag")}
            className="h-8 w-40 shrink-0"
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
          {canEdit && (
            <span className="ml-auto hidden text-xs text-muted-foreground md:inline">{t("bulkHint")}</span>
          )}
        </div>

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
            selectedIds={selectedIds}
            onSelectionChange={canEdit ? setSelectedIds : undefined}
            fillHeight
          />
        )}
      </div>

      {selectedTasks.length > 0 && (
        <BulkBar
          selected={selectedTasks}
          columns={columns}
          members={members}
          labels={bulkLabels}
          canDelete={canDelete}
          onRun={handleBulk}
          onClear={() => setSelectedIds(new Set())}
        />
      )}

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
          aiEnabled={aiEnabled}
          onClose={() => setOpenTask(null)}
          onSaved={upsertTask}
          onDeleted={removeTask}
          onNavigateToTask={(taskId) => {
            const target = state.tasks.find((t) => t.id === taskId);
            if (target) setOpenTask(target);
          }}
        />
      )}

      {canEdit && (
        <ImportTasksDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          projectId={projectId}
          columns={columns}
          priorities={priorities}
          members={members}
          onImported={(tasks) => tasks.forEach(upsertTask)}
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
    </LabelPresetsProvider>
    </WorkflowProvider>
  );
}
