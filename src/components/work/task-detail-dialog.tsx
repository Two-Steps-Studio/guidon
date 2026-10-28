"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useGuardedClose } from "@/components/ui/use-guarded-close";
import { confirmAction } from "@/components/ui/confirm-action";
import { Check, Copy, Eye, Loader2, Pencil, Trash2, Pin, PinOff } from "lucide-react";
import { toast } from "sonner";
import { timeAction } from "@/lib/perf/action-timing";
import { clearTaskDraft, isNetworkError, readTaskDraft, taskDraftKey, writeTaskDraft } from "@/lib/work/task-drafts";
import { MarkdownPreview } from "@/components/files/markdown-preview";
import { useTranslations } from "next-intl";
import { usePinnedTasks } from "@/components/work/pinned-tasks-context";
import { taskRef } from "@/lib/github/task-refs";
import { deleteTask, updateTask } from "@/app/projects/[id]/work/actions";
import { getTaskWhyContext, type TaskWhyContext } from "@/lib/context/task-why";
import { TaskWhyPanel } from "@/components/work/task-why-panel";
import { TaskLinksPanel } from "@/components/work/task-links-panel";
import { TaskAttemptsSection } from "@/components/work/task-attempts-section";
import { TaskAppChangesSection } from "@/components/work/task-app-changes-section";
import { TaskAttachmentsSection } from "@/components/work/task-attachments-section";
import { TaskRelationsSection } from "@/components/work/task-relations-section";
import { TaskSubtasksSection } from "@/components/work/task-subtasks-section";
import { TaskCommentsSection } from "@/components/work/task-comments-section";
import { TaskAgentContextExport } from "@/components/work/task-agent-context-export";
import { TaskAttachmentsProvider, useTaskAttachments } from "@/components/work/task-attachments-context";
import { TaskImageGallery, useGalleryImages } from "@/components/work/task-image-gallery";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { useImagePaste } from "@/components/work/use-image-paste";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  BOARD_COLUMNS,
  dueDateKey,
  normalizeTaskPriority,
  normalizeTaskStatus,
  priorityDef,
  type BoardColumn,
} from "@/lib/work/task-board";
import { useWorkflow } from "@/components/work/workflow-context";
import { type TaskCardMember } from "@/components/work/task-card";
import { LabelChip } from "@/components/work/label-chip";
import { useLabelPresets } from "@/components/work/label-presets-context";
import { DescriptionToolbar, descriptionKeyDown } from "@/components/work/description-toolbar";
import { MAX_RECURRENCE_INTERVAL, isRecurrenceRule, type RecurrenceRule } from "@/lib/work/recurrence-core";
import { toggleTaskAtLine, type EditResult } from "@/lib/work/markdown-edit";
import type { Task, TaskPriority, TaskStatus, UpdateTaskData } from "@/types/task";
import { playSound } from "@/lib/sounds";

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
  /** projects.ai_enabled (migration 046) - false hides the agent-only "Export agent context" action. */
  aiEnabled?: boolean;
  onClose: () => void;
  onSaved: (task: Task) => void;
  onDeleted: (taskId: string) => void;
  /** Lets a related-task link (TaskRelationsSection) switch the dialog to another task without closing it - optional, degrades to plain non-clickable text if the caller doesn't pass it. */
  onNavigateToTask?: (taskId: string) => void;
}

interface TaskForm {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_id: string;
  due_date: string;
  tags: string;
  /** "" = doesn't repeat (migration 063). */
  recurrence_rule: "" | RecurrenceRule;
  recurrence_interval: string;
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
    recurrence_rule: isRecurrenceRule(task.recurrence_rule) ? task.recurrence_rule : "",
    recurrence_interval: String(task.recurrence_interval ?? 1),
  };
}

/**
 * Thin wrapper so everything inside the dialog - file list, image gallery,
 * pasted images in the description and comments - shares one attachment
 * list (see task-attachments-context.tsx).
 */
export function TaskDetailDialog(props: TaskDetailDialogProps) {
  if (!props.task) return null;
  return (
    <TaskAttachmentsProvider projectId={props.projectId} taskId={props.task.id}>
      <TaskDetailDialogInner {...props} />
    </TaskAttachmentsProvider>
  );
}

function TaskDetailDialogInner({
  projectId,
  task,
  subtasks,
  members,
  canEdit,
  canDelete,
  canComment,
  currentUserId,
  columns: columnsProp,
  aiEnabled = true,
  onClose,
  onSaved,
  onDeleted,
  onNavigateToTask,
}: TaskDetailDialogProps) {
  // Derived from `task` at mount rather than synced via an effect; the parent
  // keys this component by task id, so opening a different task remounts it
  // and re-runs these initialisers.
  const t = useTranslations("work");
  const pinnedTasks = usePinnedTasks();
  // Columns from the caller when it has them (the board passes its visible
  // set), else the project's from WorkflowProvider; priorities always from there.
  const workflow = useWorkflow();
  const columns = columnsProp ?? workflow.columns;
  const priorities = workflow.priorities;
  const [form, setForm] = useState<TaskForm | null>(() =>
    task ? formToTask(task) : null
  );
  const labelPresets = useLabelPresets();
  const currentTags = (form?.tags ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  // Tapping a preset adds it to (or removes it from) the comma-separated
  // labels field, so free-typed labels and presets end up in the same place.
  const togglePreset = (name: string) =>
    setForm((current) => {
      if (!current) return current;
      const tags = current.tags.split(",").map((tag) => tag.trim()).filter(Boolean);
      const has = tags.some((tag) => tag.toLowerCase() === name.toLowerCase());
      const next = has ? tags.filter((tag) => tag.toLowerCase() !== name.toLowerCase()) : [...tags, name];
      return { ...current, tags: next.join(", ") };
    });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const dirty = !!task && JSON.stringify(form) !== JSON.stringify(formToTask(task));
  // Unsaved edits also live in this browser (lib/work/task-drafts.ts) until
  // they are saved or deliberately discarded, so a crash or a killed mobile
  // tab doesn't lose them.
  const draftKey = task && canEdit && currentUserId ? taskDraftKey(currentUserId, task.id) : null;
  // After a save, delete or discard, a pending debounced write must not
  // bring the draft back (it would reopen as a false conflict).
  const draftDone = useRef(false);
  const discardDraft = () => { draftDone.current = true; if (draftKey) clearTaskDraft(draftKey); };
  const requestClose = useGuardedClose(dirty, saving || deleting, () => { discardDraft(); onClose(); });
  const [error, setError] = useState<string | null>(null);
  // This version belongs to the form's initial snapshot, even if parent props
  // change while the person is typing. Never advance it behind their edits -
  // a restored draft keeps the version it was written against.
  const [editRevision, setEditRevision] = useState(task?.revision ?? -1);
  const [draftRestoredAt, setDraftRestoredAt] = useState<number | null>(null);
  const [editConflict, setEditConflict] = useState(false);
  // A written description opens rendered (links clickable, lists and
  // checklists as such) and "Edit" switches to the text; an empty one opens
  // straight in the editor. Someone who can't edit only sees it rendered.
  const [previewingDescription, setPreviewingDescription] = useState(
    () => !canEdit || Boolean(task?.description?.trim())
  );
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

  const [whyContext, setWhyContext] = useState<TaskWhyContext | null>(null);
  const [whyLoading, setWhyLoading] = useState(true);
  const [whyError, setWhyError] = useState<string | null>(null);
  const [gitRefCopied, setGitRefCopied] = useState(false);

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

  const handleCopyGitRef = async () => {
    if (!task) return;
    try {
      await navigator.clipboard.writeText(taskRef(task.id));
      setGitRefCopied(true);
      setTimeout(() => setGitRefCopied(false), 2000);
    } catch {
      // Clipboard blocked (permissions/insecure context) - the ref is visible to copy by hand.
    }
  };

  const handleCopyTaskId = async () => {
    if (!task) return;
    try {
      await navigator.clipboard.writeText(task.id);
      toast.success(t("taskIdCopied"));
    } catch {
      toast.error(t("failedToCopyToClipboard"));
    }
  };

  const taskId = task?.id;

  // "Why" context is fetched for the task this dialog was mounted for (the
  // comments section loads its own); all state updates inside the loader
  // happen after an await.
  useEffect(() => {
    if (!taskId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadWhy(taskId);
  }, [taskId, loadWhy]);

  // Restored after mount, not in the state initialisers: the dialog can be
  // server-rendered (?openTask=), and the server has no drafts.
  const restoreChecked = useRef(false);
  useEffect(() => {
    if (restoreChecked.current || !draftKey || !task || !currentUserId) return;
    restoreChecked.current = true;
    const draft = readTaskDraft<TaskForm>(draftKey, currentUserId);
    if (!draft) return;
    const current = formToTask(task);
    const restored = { ...current, ...draft.form };
    if (JSON.stringify(restored) === JSON.stringify(current)) return clearTaskDraft(draftKey);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm(restored);
    setEditRevision(draft.revision);
    setDraftRestoredAt(draft.savedAt);
  }, [draftKey, task, currentUserId]);
  useEffect(() => {
    if (!draftKey || !currentUserId || !dirty || !restoreChecked.current) return;
    const timer = window.setTimeout(() => !draftDone.current && writeTaskDraft(draftKey, { userId: currentUserId, revision: editRevision, form }), 300);
    return () => window.clearTimeout(timer);
  }, [draftKey, currentUserId, dirty, editRevision, form]);

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

      const result = await timeAction("task.save", () => updateTask(projectId, task.id, {
        ...patch,
        // Explicit nulls: an empty field means "clear", not "leave alone".
        description: form.description.trim() || null,
        assignee_id: form.assignee_id || null,
        due_date: form.due_date ? new Date(form.due_date).toISOString() : null,
        // Subtasks don't repeat (063) - only sent for a top-level task.
        ...(task.parent_task_id
          ? {}
          : {
              recurrence_rule: form.recurrence_rule || null,
              recurrence_interval: form.recurrence_rule ? Number(form.recurrence_interval) : null,
            }),
      }, editRevision));

      if (result.error || !result.task) { setEditConflict(result.code === "conflict" || result.code === "version_unavailable"); throw new Error(result.error ?? t("failedToSaveTask")); }

      if (result.task.is_done && !task.is_done) playSound("complete");
      discardDraft();
      onSaved(result.task);
      // A repeating task finished here: its next occurrence joins the board.
      result.created?.forEach(onSaved);
      onClose();
    } catch (err) {
      setError(isNetworkError(err) ? t("networkError") : err instanceof Error ? err.message : t("failedToSaveTask"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!task) return;
    if (!await confirmAction(`${task.title}\n\n${t("bulkDeleteConfirm", { count: 1 })}`, t("delete"))) return;

    setDeleting(true);
    setError(null);

    try {
      const result = await timeAction("task.delete", () => deleteTask(projectId, task.id));
      if (result.error) throw new Error(result.error);

      discardDraft();
      onDeleted(task.id);
      onClose();
      toast.success(t("taskDeletedToast", { title: task.title }));
    } catch (err) {
      setError(isNetworkError(err) ? t("networkError") : err instanceof Error ? err.message : t("failedToDeleteTask"));
    } finally {
      setDeleting(false);
    }
  };

  const { imageUrls } = useTaskAttachments();
  const galleryImages = useGalleryImages();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const openImage = (attachmentId: string) => {
    const index = galleryImages.findIndex((image) => image.id === attachmentId);
    if (index >= 0) setLightboxIndex(index);
  };
  const descriptionPaste = useImagePaste({
    fieldRef: descriptionRef,
    update: (fn) => setForm((current) => (current ? { ...current, description: fn(current.description) } : current)),
    enabled: canEdit && canComment,
    onError: (message) => setError(message),
  });

  if (!task || !form) return null;

  // A task can end up on a status its project has since hidden from the
  // board (e.g. the AI Task API sets ai_working without knowing about
  // per-project column visibility) - keep the current value selectable
  // even then, rather than silently rendering an option list that doesn't
  // contain the form's own value.
  const statusOptions: readonly BoardColumn[] = columns.some((c) => c.status === form.status)
    ? columns
    : [
        ...columns,
        BOARD_COLUMNS.find((c) => c.status === form.status) ?? {
          status: form.status,
          label: form.status,
          hint: "",
          accentClass: "bg-muted-foreground",
          isDone: false,
          custom: true,
        },
      ];
  // Same for a priority the project has since hidden.
  const priorityOptions = priorities.some((p) => p.key === form.priority)
    ? priorities
    : [...priorities, priorityDef(form.priority)];

  return (
    <>
    <Dialog open onOpenChange={(open) => { if (!open) void requestClose(); }}>
      <DialogContent
        scrollable
        className="sm:max-w-2xl"
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
          <div className="flex min-w-0 items-center gap-2 pt-1 text-xs text-muted-foreground">
            <span className="shrink-0">{t("taskIdLabel")}</span>
            <code className="min-w-0 select-all break-all font-mono text-foreground">{task.id}</code>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={handleCopyTaskId}
              aria-label={t("copyTaskId")}
              title={t("copyTaskId")}
            >
              <Copy className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </div>
          {/* Mentioning this in a commit, PR or branch name links it via the GitHub integration (src/lib/github/task-refs.ts). */}
          <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
            <span className="max-sm:hidden">{t("gitRefLabel")}</span>
            <code className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-foreground">
              {taskRef(task.id)}
            </code>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handleCopyGitRef}
              aria-label={t("copyGitRef")}
              title={t("copyGitRef")}
            >
              {gitRefCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
            {pinnedTasks && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-auto h-6 gap-1 px-2 text-xs"
                aria-pressed={pinnedTasks.isPinned(task.id)}
                onClick={() => void pinnedTasks.toggle({ id: task.id, title: task.title, project_id: projectId })}
              >
                {pinnedTasks.isPinned(task.id) ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                {pinnedTasks.isPinned(task.id) ? t("unpinTask") : t("pinTask")}
              </Button>
            )}
          </div>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-4" data-save-shortcut>
          {canEdit && (
            <div className="flex items-center gap-2">
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
                  onClick={() => { void requestClose(); }}
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
              {canEdit && (
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
              )}
            </div>
            {previewingDescription ? (
              <div className="max-h-64 overflow-y-auto rounded-md border border-input">
                <MarkdownPreview
                  content={form.description || t("descriptionPlaceholder2")}
                  resolveAttachment={(id) => imageUrls[id]}
                  onOpenAttachment={openImage}
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
                  onPaste={descriptionPaste.onPaste}
                  onDragOver={descriptionPaste.onDragOver}
                  onDrop={descriptionPaste.onDrop}
                />
                {canEdit && (
                  <p className="text-xs text-muted-foreground">
                    {descriptionPaste.uploading ? t("uploadingPastedImage") : t("pasteImageHint")}
                  </p>
                )}
              </>
            )}
          </div>

          <TaskImageGallery />

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
                {priorityOptions.map((priority) => (
                  <option key={priority.key} value={priority.key}>
                    {priority.label}
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
              <DatePicker
                id="task-due"
                value={form.due_date}
                disabled={!canEdit}
                onChange={(due_date) => setForm({ ...form, due_date })}
              />
            </div>

            {!task.parent_task_id && (
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="task-repeat">{t("repeatLabel")}</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    id="task-repeat"
                    className="w-48"
                    value={form.recurrence_rule}
                    disabled={!canEdit}
                    onChange={(event) =>
                      setForm({ ...form, recurrence_rule: event.target.value as TaskForm["recurrence_rule"] })
                    }
                  >
                    <option value="">{t("repeatNever")}</option>
                    <option value="weekly">{t("repeatWeekly")}</option>
                    <option value="monthly">{t("repeatMonthly")}</option>
                    <option value="every_n_days">{t("repeatEveryNDays")}</option>
                  </Select>
                  {form.recurrence_rule && (
                    <label className="flex items-center gap-2 text-sm text-muted-foreground">
                      {t("repeatEvery")}
                      <Input
                        type="number"
                        min={1}
                        max={MAX_RECURRENCE_INTERVAL}
                        className="h-9 w-20"
                        aria-label={t("repeatIntervalAria")}
                        value={form.recurrence_interval}
                        disabled={!canEdit}
                        onChange={(event) => setForm({ ...form, recurrence_interval: event.target.value })}
                      />
                      {t(`repeatUnit_${form.recurrence_rule}`, { count: Number(form.recurrence_interval) || 1 })}
                    </label>
                  )}
                </div>
                {form.recurrence_rule && <p className="text-xs text-muted-foreground">{t("repeatHint")}</p>}
              </div>
            )}
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
            {labelPresets.length > 0 && (
              <div className="flex flex-wrap gap-1.5" aria-label={t("labelPresetsAria")} role="group">
                {labelPresets.map((preset) => {
                  const active = currentTags.some((tag) => tag.toLowerCase() === preset.name.toLowerCase());
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      disabled={!canEdit}
                      aria-pressed={active}
                      onClick={() => togglePreset(preset.name)}
                      className={cn(
                        "rounded-full transition-opacity disabled:cursor-not-allowed",
                        active ? "opacity-100" : "opacity-50 hover:opacity-80"
                      )}
                    >
                      <LabelChip name={preset.name} color={preset.color} />
                    </button>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {t("commaSeparated")}
            </p>
          </div>

          {draftRestoredAt !== null && (
            <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm">
              <span>{t("draftRestored", { time: new Date(draftRestoredAt).toLocaleString() })}</span>
              <Button type="button" size="sm" variant="ghost" onClick={() => {
                clearTaskDraft(draftKey!);
                setForm(formToTask(task));
                setEditRevision(task.revision ?? -1);
                setDraftRestoredAt(null);
              }}>{t("discardDraft")}</Button>
            </div>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          {editConflict && <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => {
              const url = URL.createObjectURL(new Blob([JSON.stringify({ projectId, taskId: task.id, revision: editRevision, edits: form }, null, 2)], { type: "application/json" }));
              const link = document.createElement("a"); link.href = url; link.download = `guidon-task-draft-${task.id}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}>{t("downloadTaskEdits")}</Button>
            <Button type="button" variant="outline" onClick={() => void requestClose(() => { discardDraft(); window.location.reload(); }, { unload: true })}>{t("reloadTask")}</Button>
          </div>}
        </form>

        <TaskWhyPanel why={whyContext} loading={whyLoading} error={whyError} members={members} />

        <TaskLinksPanel projectId={projectId} taskId={task.id} canEdit={canEdit} />

        <TaskAppChangesSection
          projectId={projectId}
          taskId={task.id}
          members={members}
          columns={columns}
          priorities={priorities}
          canEdit={canEdit}
          onUndone={(undone) => {
            // An untouched form follows the undo; one with unsaved edits keeps
            // them and its old revision, so saving gets the conflict screen.
            if (!dirty) {
              setForm(formToTask(undone));
              setEditRevision(undone.revision ?? -1);
            }
            onSaved(undone);
          }}
        />

        {aiEnabled && (
          <TaskAgentContextExport projectId={projectId} taskId={task.id} />
        )}

        <TaskSubtasksSection
          projectId={projectId}
          task={task}
          subtasks={subtasks}
          columns={columns}
          canEdit={canEdit}
          canDelete={canDelete}
          onSaved={onSaved}
          onDeleted={onDeleted}
        />

        <TaskAttemptsSection
          projectId={projectId}
          taskId={task.id}
          canEdit={canEdit}
          canDelete={canDelete}
        />

        <TaskAttachmentsSection
          canUpload={canComment}
          currentUserId={currentUserId}
          canManageProject={canDelete}
        />

        <TaskRelationsSection
          projectId={projectId}
          taskId={task.id}
          columns={columns}
          canView={true}
          canLink={canEdit}
          canRemove={canDelete}
          onNavigateToTask={onNavigateToTask ? taskId => { void requestClose(() => onNavigateToTask(taskId)); } : undefined}
        />

        <TaskCommentsSection
          projectId={projectId}
          task={task}
          members={members}
          canEdit={canEdit}
          canComment={canComment}
          currentUserId={currentUserId}
          onDecisionCreated={() => void loadWhy(task.id)}
          onOpenImage={openImage}
        />
        <ImageLightbox
          images={galleryImages}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      </DialogContent>
    </Dialog>

    </>
  );
}

