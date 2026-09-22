"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Check, Copy, Eye, Gavel, Loader2, Pencil, Plus, Send, Trash2, X } from "lucide-react";
import { MarkdownPreview } from "@/components/files/markdown-preview";
import { useTranslations } from "next-intl";
import {
  createSubtask,
  deleteTask,
  loadComments as loadCommentsAction,
  postComment,
  updateTask,
  type TaskComment,
} from "@/app/projects/[id]/work/actions";
import { CreateDecisionDialog } from "@/app/projects/[id]/decisions/create-decision-dialog";
import { getTaskWhyContext, type TaskWhyContext } from "@/lib/context/task-why";
import { getTaskAgentContext } from "@/lib/context/agent-context";
import { TaskWhyPanel } from "@/components/work/task-why-panel";
import { TaskAttemptsSection } from "@/components/work/task-attempts-section";
import { TaskAttachmentsSection } from "@/components/work/task-attachments-section";
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
import { cn } from "@/lib/utils";
import {
  BOARD_COLUMNS,
  TASK_PRIORITIES,
  dueDateKey,
  isDone,
  normalizeTaskPriority,
  normalizeTaskStatus,
  type BoardColumn,
} from "@/lib/work/task-board";
import { initialsFor, type TaskCardMember } from "@/components/work/task-card";
import { DescriptionToolbar, descriptionKeyDown } from "@/components/work/description-toolbar";
import { toggleTaskAtLine, type EditResult } from "@/lib/work/markdown-edit";
import type { Task, TaskPriority, TaskStatus, UpdateTaskData } from "@/types/task";

interface TaskDetailDialogProps {
  projectId: string;
  task: Task | null;
  /** Subtasks (migration 010) of `task`, already sorted. Empty when task is null. */
  subtasks: Task[];
  members: TaskCardMember[];
  canEdit: boolean;
  canDelete: boolean;
  canComment: boolean;
  currentUserId: string | null;
  /** The project's resolved (default + overrides) column set - see resolveBoardColumns(). */
  columns?: readonly BoardColumn[];
  onClose: () => void;
  onSaved: (task: Task) => void;
  onDeleted: (taskId: string) => void;
}

interface TaskForm {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_id: string;
  due_date: string;
  tags: string;
}

function formToTask(task: Task): TaskForm {
  return {
    title: task.title,
    description: task.description ?? "",
    status: normalizeTaskStatus(task.status),
    priority: normalizeTaskPriority(task.priority),
    assignee_id: task.assignee_id ?? "",
    due_date: dueDateKey(task.due_date) ?? "",
    tags: (task.tags ?? []).join(", "),
  };
}

/**
 * A subtask can be sitting on a status the project has since hidden from
 * the board (same reasoning as the parent task's own `statusOptions` below)
 * - keep it selectable rather than silently omitting it from the dropdown.
 */
function subtaskStatusOptions(
  status: TaskStatus,
  columns: readonly BoardColumn[]
): readonly BoardColumn[] {
  return columns.some((c) => c.status === status)
    ? columns
    : [...columns, BOARD_COLUMNS.find((c) => c.status === status)!];
}

export function TaskDetailDialog({
  projectId,
  task,
  subtasks,
  members,
  canEdit,
  canDelete,
  canComment,
  currentUserId,
  columns = BOARD_COLUMNS,
  onClose,
  onSaved,
  onDeleted,
}: TaskDetailDialogProps) {
  // Derived from `task` at mount rather than synced via an effect; the parent
  // keys this component by task id, so opening a different task remounts it
  // and re-runs these initialisers.
  const t = useTranslations("work");
  const [form, setForm] = useState<TaskForm | null>(() =>
    task ? formToTask(task) : null
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Defaults to editing (today's behavior unchanged) - Markdown preview is
  // opt-in per open dialog, not remembered across tasks.
  const [previewingDescription, setPreviewingDescription] = useState(false);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const applyDescriptionEdit = (result: EditResult) => {
    setForm((current) => (current ? { ...current, description: result.value } : current));
    // The controlled value lands on the next render; put the caret back after it.
    requestAnimationFrame(() => {
      const el = descriptionRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  };

  const [comments, setComments] = useState<TaskComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

  const [whyContext, setWhyContext] = useState<TaskWhyContext | null>(null);
  const [whyLoading, setWhyLoading] = useState(true);
  const [whyError, setWhyError] = useState<string | null>(null);

  // Generic Agent Context export (TODO.md §18) - generated on demand rather
  // than alongside Why/comments, since most task views never open it.
  const [agentContextOpen, setAgentContextOpen] = useState(false);
  const [agentContextMarkdown, setAgentContextMarkdown] = useState("");
  const [agentContextLoading, setAgentContextLoading] = useState(false);
  const [agentContextError, setAgentContextError] = useState<string | null>(null);
  const [agentContextCopied, setAgentContextCopied] = useState(false);

  const membersById = new Map(members.map((member) => [member.id, member]));

  const loadComments = useCallback(
    async (taskId: string) => {
      try {
        const result = await loadCommentsAction(projectId, taskId);
        if (result.error) throw new Error(result.error);
        setComments(result.comments);
      } catch (err) {
        setCommentsError(
          err instanceof Error ? err.message : t("failedToLoadComments")
        );
      } finally {
        setCommentsLoading(false);
      }
    },
    [projectId, t]
  );

  // Fetched lazily when the dialog opens rather than prefetched for every
  // task on the board - see the module comment in task-why.ts for why.
  const loadWhy = useCallback(
    async (taskId: string) => {
      setWhyLoading(true);
      setWhyError(null);
      try {
        const result = await getTaskWhyContext(projectId, taskId);
        if (result.error) throw new Error(result.error);
        setWhyContext(result);
      } catch (err) {
        setWhyError(err instanceof Error ? err.message : t("failedToLoadContext"));
      } finally {
        setWhyLoading(false);
      }
    },
    [projectId, t]
  );

  const handleExportAgentContext = async () => {
    if (!task) return;

    setAgentContextOpen(true);
    setAgentContextLoading(true);
    setAgentContextError(null);
    setAgentContextCopied(false);

    try {
      const result = await getTaskAgentContext(projectId, task.id);
      if (result.error) throw new Error(result.error);
      setAgentContextMarkdown(result.markdown);
    } catch (err) {
      setAgentContextError(err instanceof Error ? err.message : t("failedToGenerateAgentContext"));
    } finally {
      setAgentContextLoading(false);
    }
  };

  const handleCopyAgentContext = async () => {
    try {
      await navigator.clipboard.writeText(agentContextMarkdown);
      setAgentContextCopied(true);
      setTimeout(() => setAgentContextCopied(false), 2000);
    } catch {
      setAgentContextError(t("failedToCopyToClipboard"));
    }
  };

  const taskId = task?.id;

  // Comments and "why" context are fetched for the task this dialog was
  // mounted for; all state updates inside these loaders happen after an await.
  useEffect(() => {
    if (!taskId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadComments(taskId);
    void loadWhy(taskId);
  }, [taskId, loadComments, loadWhy]);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!task || !form) return;

    setSaving(true);
    setError(null);

    try {
      const patch: Omit<UpdateTaskData, "id"> = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        status: form.status,
        priority: form.priority,
        assignee_id: form.assignee_id || undefined,
        due_date: form.due_date
          ? new Date(form.due_date).toISOString()
          : undefined,
        tags: form.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      };

      const result = await updateTask(projectId, task.id, {
        ...patch,
        // Explicit nulls: an empty field means "clear", not "leave alone".
        description: form.description.trim() || null,
        assignee_id: form.assignee_id || null,
        due_date: form.due_date ? new Date(form.due_date).toISOString() : null,
      });

      if (result.error || !result.task) throw new Error(result.error ?? t("failedToSaveTask"));

      onSaved(result.task);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failedToSaveTask"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!task) return;

    setDeleting(true);
    setError(null);

    try {
      const result = await deleteTask(projectId, task.id);
      if (result.error) throw new Error(result.error);

      onDeleted(task.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failedToDeleteTask"));
    } finally {
      setDeleting(false);
    }
  };

  const handleComment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!task || !draft.trim() || !currentUserId) return;

    setPosting(true);
    setCommentsError(null);

    try {
      const result = await postComment(projectId, task.id, draft.trim());
      if (result.error || !result.comment) throw new Error(result.error ?? t("failedToPostComment"));

      setComments((current) => [...current, result.comment as TaskComment]);
      setDraft("");
    } catch (err) {
      setCommentsError(
        err instanceof Error ? err.message : t("failedToPostComment")
      );
    } finally {
      setPosting(false);
    }
  };

  const [subtaskDraft, setSubtaskDraft] = useState("");
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [subtaskError, setSubtaskError] = useState<string | null>(null);
  const [savingSubtaskId, setSavingSubtaskId] = useState<string | null>(null);
  const [deletingSubtaskId, setDeletingSubtaskId] = useState<string | null>(null);
  // Keyed by subtask id. Only holds an entry while that row has an
  // in-flight or not-yet-committed edit - absence means "show the row's
  // own field", so a successful or failed save both fall back to the
  // latest server value once the entry is removed in `finally`.
  const [subtaskTitleDrafts, setSubtaskTitleDrafts] = useState<Record<string, string>>({});
  const [subtaskStatusDrafts, setSubtaskStatusDrafts] = useState<Record<string, TaskStatus>>({});
  // Escape needs to suppress the blur-triggered commit that follows it
  // synchronously, before the draft-clearing setState above has landed - a
  // ref (not state) is what lets handleSubtaskTitleCommit see the
  // cancellation on the very same tick the blur handler runs.
  const escapedSubtaskIds = useRef<Set<string>>(new Set());

  function clearDraft<T>(setter: React.Dispatch<React.SetStateAction<Record<string, T>>>, id: string) {
    setter((current) => {
      if (!(id in current)) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  const handleAddSubtask = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!task || !subtaskDraft.trim()) return;

    setAddingSubtask(true);
    setSubtaskError(null);

    try {
      const result = await createSubtask(projectId, task.id, subtaskDraft.trim());
      if (result.error || !result.task) throw new Error(result.error ?? t("failedToCreateSubtask"));

      // Subtasks are plain tasks, so the same onSaved callback that updates
      // the board's task list handles them - no separate state to sync.
      onSaved(result.task);
      setSubtaskDraft("");
    } catch (err) {
      setSubtaskError(err instanceof Error ? err.message : t("failedToCreateSubtask"));
    } finally {
      setAddingSubtask(false);
    }
  };

  const handleSubtaskStatusChange = async (subtask: Task, status: TaskStatus) => {
    // Set immediately so the (now-disabled) <select> shows the chosen value
    // for the duration of the request instead of snapping back to the old
    // one until `onSaved` updates `subtask` from the parent.
    setSubtaskStatusDrafts((current) => ({ ...current, [subtask.id]: status }));
    setSavingSubtaskId(subtask.id);
    setSubtaskError(null);

    try {
      const result = await updateTask(projectId, subtask.id, { status });
      if (result.error || !result.task) throw new Error(result.error ?? t("failedToUpdateSubtask"));

      onSaved(result.task);
    } catch (err) {
      setSubtaskError(err instanceof Error ? err.message : t("failedToUpdateSubtask"));
    } finally {
      setSavingSubtaskId(null);
      clearDraft(setSubtaskStatusDrafts, subtask.id);
    }
  };

  const handleSubtaskTitleCommit = async (subtask: Task) => {
    if (escapedSubtaskIds.current.delete(subtask.id)) return;

    const draft = (subtaskTitleDrafts[subtask.id] ?? subtask.title).trim();

    if (!draft || draft === subtask.title) {
      clearDraft(setSubtaskTitleDrafts, subtask.id);
      return;
    }

    setSavingSubtaskId(subtask.id);
    setSubtaskError(null);

    try {
      const result = await updateTask(projectId, subtask.id, { title: draft });
      if (result.error || !result.task) throw new Error(result.error ?? t("failedToRenameSubtask"));

      onSaved(result.task);
    } catch (err) {
      setSubtaskError(err instanceof Error ? err.message : t("failedToRenameSubtask"));
    } finally {
      setSavingSubtaskId(null);
      clearDraft(setSubtaskTitleDrafts, subtask.id);
    }
  };

  const handleDeleteSubtask = async (subtaskId: string) => {
    setDeletingSubtaskId(subtaskId);
    setSubtaskError(null);

    try {
      const result = await deleteTask(projectId, subtaskId);
      if (result.error) throw new Error(result.error);

      onDeleted(subtaskId);
    } catch (err) {
      setSubtaskError(err instanceof Error ? err.message : t("failedToDeleteSubtask"));
    } finally {
      setDeletingSubtaskId(null);
    }
  };

  if (!task || !form) return null;

  // A task can end up on a status its project has since hidden from the
  // board (e.g. the AI Task API sets ai_working without knowing about
  // per-project column visibility) - keep the current value selectable
  // even then, rather than silently rendering an option list that doesn't
  // contain the form's own value.
  const statusOptions = columns.some((c) => c.status === form.status)
    ? columns
    : [...columns, BOARD_COLUMNS.find((c) => c.status === form.status)!];

  return (
    <>
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
        onEscapeKeyDown={(event) => {
          const target = event.target as HTMLElement | null;
          if (target?.dataset.subtaskTitleField === "true") {
            event.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="pr-6 text-base">
            {canEdit ? t("detailTitle") : task.title}
          </DialogTitle>
          <DialogDescription>
            {canEdit
              ? t("editDescription")
              : t("readOnlyDescription")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="task-title">{t("titleLabel")}</Label>
            <Input
              id="task-title"
              value={form.title}
              disabled={!canEdit}
              required
              onChange={(event) =>
                setForm({ ...form, title: event.target.value })
              }
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="task-description">{t("descriptionLabel")}</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setPreviewingDescription((current) => !current)}
              >
                {previewingDescription ? (
                  <>
                    <Pencil className="h-3.5 w-3.5" />
                    {t("editDescriptionButton")}
                  </>
                ) : (
                  <>
                    <Eye className="h-3.5 w-3.5" />
                    {t("previewDescription")}
                  </>
                )}
              </Button>
            </div>
            {previewingDescription ? (
              <div className="max-h-64 overflow-y-auto rounded-md border border-input">
                <MarkdownPreview
                  content={form.description || t("descriptionPlaceholder2")}
                  onToggleTask={
                    canEdit && form.description
                      ? (line, checked) =>
                          setForm((current) =>
                            current
                              ? { ...current, description: toggleTaskAtLine(current.description, line, checked) }
                              : current
                          )
                      : undefined
                  }
                />
              </div>
            ) : (
              <>
                {canEdit && (
                  <DescriptionToolbar
                    textareaRef={descriptionRef}
                    apply={applyDescriptionEdit}
                  />
                )}
                <Textarea
                  id="task-description"
                  ref={descriptionRef}
                  rows={6}
                  value={form.description}
                  disabled={!canEdit}
                  placeholder={t("descriptionPlaceholder2")}
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                  onKeyDown={(event) => descriptionKeyDown(event, applyDescriptionEdit)}
                />
              </>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="task-status">{t("statusLabel")}</Label>
              <Select
                id="task-status"
                value={form.status}
                disabled={!canEdit}
                onChange={(event) =>
                  setForm({
                    ...form,
                    status: event.target.value as TaskStatus,
                  })
                }
              >
                {statusOptions.map((column) => (
                  <option key={column.status} value={column.status}>
                    {column.label}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="task-priority">{t("priorityLabel")}</Label>
              <Select
                id="task-priority"
                value={form.priority}
                disabled={!canEdit}
                onChange={(event) =>
                  setForm({
                    ...form,
                    priority: event.target.value as TaskPriority,
                  })
                }
              >
                {TASK_PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {t("priority", { priority })}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="task-assignee">{t("assigneeLabel")}</Label>
              <Select
                id="task-assignee"
                value={form.assignee_id}
                disabled={!canEdit}
                onChange={(event) =>
                  setForm({ ...form, assignee_id: event.target.value })
                }
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
              <Label htmlFor="task-due">{t("dueDateLabel")}</Label>
              <Input
                id="task-due"
                type="date"
                value={form.due_date}
                disabled={!canEdit}
                onChange={(event) =>
                  setForm({ ...form, due_date: event.target.value })
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-tags">{t("labelsLabel")}</Label>
            <Input
              id="task-tags"
              value={form.tags}
              disabled={!canEdit}
              placeholder={t("labelsPlaceholder")}
              onChange={(event) =>
                setForm({ ...form, tags: event.target.value })
              }
            />
            <p className="text-xs text-muted-foreground">
              {t("commaSeparated")}
            </p>
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}

          {canEdit && (
            <div className="flex items-center gap-2 border-t border-border pt-4">
              {canDelete && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={deleting || saving}
                  onClick={handleDelete}
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  {deleting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  {t("delete")}
                </Button>
              )}

              <div className="ml-auto flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onClose}
                  disabled={saving || deleting}
                >
                  {t("cancel")}
                </Button>
                <Button type="submit" size="sm" disabled={saving || deleting}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t("saveChanges")}
                </Button>
              </div>
            </div>
          )}
        </form>

        <TaskWhyPanel why={whyContext} loading={whyLoading} error={whyError} members={members} />

        <section aria-label={t("agentContextAria")} className="border-t border-border pt-4">
          <Button type="button" variant="outline" size="sm" onClick={() => void handleExportAgentContext()}>
            <Bot className="h-4 w-4" />
            {t("exportAgentContext")}
          </Button>
        </section>

        <section
          aria-label={t("subtasksAria")}
          className="space-y-3 border-t border-border pt-4"
        >
          <h3 className="text-sm font-medium text-foreground">
            {t("subtasksHeading")}
            {subtasks.length > 0 && (
              <span className="ml-1.5 text-xs font-normal tabular-nums text-muted-foreground">
                {subtasks.filter((subtask) => isDone(subtask.status)).length}/{subtasks.length}
              </span>
            )}
          </h3>

          {subtasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noSubtasksYet")}</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <tbody>
                {subtasks.map((subtask) => {
                  const normalizedStatus = normalizeTaskStatus(subtask.status);
                  const statusValue = subtaskStatusDrafts[subtask.id] ?? normalizedStatus;
                  const titleValue = subtaskTitleDrafts[subtask.id] ?? subtask.title;
                  const saving = savingSubtaskId === subtask.id;

                  return (
                    <tr key={subtask.id} className="group">
                      <td className="w-full py-1 pr-2">
                        <Input
                          data-subtask-title-field="true"
                          value={titleValue}
                          aria-label={t("subtaskTitleAria", { title: subtask.title })}
                          disabled={!canEdit || saving}
                          className="h-8"
                          onChange={(event) =>
                            setSubtaskTitleDrafts((current) => ({
                              ...current,
                              [subtask.id]: event.target.value,
                            }))
                          }
                          onBlur={() => void handleSubtaskTitleCommit(subtask)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              event.currentTarget.blur();
                            } else if (event.key === "Escape") {
                              escapedSubtaskIds.current.add(subtask.id);
                              clearDraft(setSubtaskTitleDrafts, subtask.id);
                              event.currentTarget.blur();
                            }
                          }}
                        />
                      </td>
                      <td className="py-1 pr-2">
                        <Select
                          aria-label={t("statusForAria", { title: subtask.title })}
                          className="h-8 w-36"
                          value={statusValue}
                          disabled={!canEdit || saving}
                          onChange={(event) =>
                            void handleSubtaskStatusChange(subtask, event.target.value as TaskStatus)
                          }
                        >
                          {subtaskStatusOptions(statusValue, columns).map((column) => (
                            <option key={column.status} value={column.status}>
                              {column.label}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="py-1">
                        {canDelete && (
                          <button
                            type="button"
                            aria-label={t("deleteSubtaskAria", { title: subtask.title })}
                            disabled={deletingSubtaskId === subtask.id}
                            onClick={() => void handleDeleteSubtask(subtask.id)}
                            className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 max-md:opacity-100 disabled:opacity-60"
                          >
                            {deletingSubtaskId === subtask.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <X className="h-3.5 w-3.5" />
                            )}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {subtaskError && (
            <p role="alert" className="text-sm text-destructive">
              {subtaskError}
            </p>
          )}

          {canEdit && (
            <form onSubmit={handleAddSubtask} className="flex gap-2">
              <Input
                value={subtaskDraft}
                placeholder={t("addSubtaskPlaceholder")}
                aria-label={t("addSubtaskAria")}
                disabled={addingSubtask}
                onChange={(event) => setSubtaskDraft(event.target.value)}
              />
              <Button
                type="submit"
                size="icon"
                aria-label={t("addSubtaskButtonAria")}
                disabled={addingSubtask || !subtaskDraft.trim()}
                className="shrink-0"
              >
                {addingSubtask ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
              </Button>
            </form>
          )}
        </section>

        <TaskAttemptsSection
          projectId={projectId}
          taskId={task.id}
          canEdit={canEdit}
          canDelete={canDelete}
        />

        <TaskAttachmentsSection
          projectId={projectId}
          taskId={task.id}
          canUpload={canEdit}
          currentUserId={currentUserId}
          canManageProject={canDelete}
        />

        <section
          aria-label={t("commentsAria")}
          className="space-y-3 border-t border-border pt-4"
        >
          <h3 className="text-sm font-medium text-foreground">
            {t("commentsHeading")}
            {comments.length > 0 && (
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                {comments.length}
              </span>
            )}
          </h3>

          {commentsLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t("loadingComments")}
            </p>
          ) : commentsError ? (
            <p
              role="alert"
              className="text-sm text-destructive"
            >
              {commentsError}
            </p>
          ) : comments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("noCommentsYet")}
            </p>
          ) : (
            <ul className="space-y-3">
              {comments.map((comment) => {
                const author = membersById.get(comment.author_id);
                const isBot = Boolean(comment.actor_label);

                return (
                  <li key={comment.id} className="group flex gap-2.5">
                    <span
                      aria-hidden
                      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-medium text-secondary-foreground"
                    >
                      {isBot ? <Bot className="h-3.5 w-3.5" /> : author ? initialsFor(author) : "?"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {comment.actor_label || author?.full_name || author?.email || t("unknownAuthor")}
                        </span>
                        {" · "}
                        {new Date(comment.created_at).toLocaleString()}
                        {canEdit && task && (
                          <CreateDecisionDialog
                            projectId={projectId}
                            idPrefix={`comment-decision-${comment.id}`}
                            defaults={{
                              title: comment.content.length > 60 ? `${comment.content.slice(0, 60)}…` : comment.content,
                              description: comment.content,
                            }}
                            link={{ sourceType: "task", sourceId: task.id }}
                            onCreated={() => void loadWhy(task.id)}
                            trigger={
                              <button
                                type="button"
                                title={t("markAsDecision")}
                                aria-label={t("markCommentAsDecisionAria")}
                                className="ml-auto text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 max-md:opacity-100"
                              >
                                <Gavel className="h-3 w-3" />
                              </button>
                            }
                          />
                        )}
                      </p>
                      <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-foreground">
                        {comment.content}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {canComment && (
            <form onSubmit={handleComment} className="flex gap-2">
              <Input
                value={draft}
                placeholder={t("addCommentPlaceholder")}
                aria-label={t("addCommentAria")}
                disabled={posting}
                onChange={(event) => setDraft(event.target.value)}
              />
              <Button
                type="submit"
                size="icon"
                aria-label={t("postCommentAria")}
                disabled={posting || !draft.trim()}
                className={cn("shrink-0")}
              >
                {posting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </form>
          )}
        </section>
      </DialogContent>
    </Dialog>

    <Dialog open={agentContextOpen} onOpenChange={setAgentContextOpen}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("agentContextDialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("agentContextDialogDescription")}
          </DialogDescription>
        </DialogHeader>

        {agentContextLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t("generatingContext")}
          </p>
        ) : agentContextError ? (
          <p role="alert" className="text-sm text-destructive">
            {agentContextError}
          </p>
        ) : (
          <div className="space-y-3">
            <Textarea
              readOnly
              rows={16}
              value={agentContextMarkdown}
              className="font-mono text-xs"
              onFocus={(event) => event.currentTarget.select()}
            />
            <div className="flex justify-end">
              <Button type="button" size="sm" onClick={() => void handleCopyAgentContext()}>
                {agentContextCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {agentContextCopied ? t("copied") : t("copyToClipboard")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}
