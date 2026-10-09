"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Eye, Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { MarkdownPreview } from "@/components/files/markdown-preview";
import { useTranslations } from "next-intl";
import { taskRef } from "@/lib/github/task-refs";
import { deleteTask, updateTask } from "@/app/projects/[id]/work/actions";
import { getTaskWhyContext, type TaskWhyContext } from "@/lib/context/task-why";
import { TaskWhyPanel } from "@/components/work/task-why-panel";
import { TaskAttemptsSection } from "@/components/work/task-attempts-section";
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
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  BOARD_COLUMNS,
  TASK_PRIORITIES,
  dueDateKey,
  normalizeTaskPriority,
  normalizeTaskStatus,
  type BoardColumn,
} from "@/lib/work/task-board";
import { type TaskCardMember } from "@/components/work/task-card";
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
  columns = BOARD_COLUMNS,
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

  const taskId = task?.id;

  // "Why" context is fetched for the task this dialog was mounted for (the
  // comments section loads its own); all state updates inside the loader
  // happen after an await.
  useEffect(() => {
    if (!taskId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadWhy(taskId);
  }, [taskId, loadWhy]);

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
      toast.success(t("taskDeletedToast", { title: task.title }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failedToDeleteTask"));
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
          {/* Mentioning this in a commit, PR or branch name links it via the GitHub integration (src/lib/github/task-refs.ts). */}
          <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
            <span>{t("gitRefLabel")}</span>
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
          </div>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-4">
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
        </form>

        <TaskWhyPanel why={whyContext} loading={whyLoading} error={whyError} members={members} />

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
          onNavigateToTask={onNavigateToTask}
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

