"use client";

import { useEffect, useRef, useState } from "react";
import { useGuardedClose } from "@/components/ui/use-guarded-close";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { timeAction } from "@/lib/perf/action-timing";
import { clearTaskDraft, isNetworkError, newTaskId, readTaskDraft, taskDraftKey, writeTaskDraft } from "@/lib/work/task-drafts";
import { ImagePlus, Loader2, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DescriptionToolbar, descriptionKeyDown } from "@/components/work/description-toolbar";
import { LabelChip } from "@/components/work/label-chip";
import { useLabelPresets } from "@/components/work/label-presets-context";
import type { TaskCardMember } from "@/components/work/task-card";
import type { EditResult } from "@/lib/work/markdown-edit";
import { normalizeTaskStatus, priorityDef, type BoardColumn } from "@/lib/work/task-board";
import { usePriorities } from "@/components/work/workflow-context";
import { cn } from "@/lib/utils";
import type { Task, TaskPriority, TaskStatus } from "@/types/task";
import { createTask, updateTask } from "./actions";
import { uploadTaskAttachment } from "./attachments-actions";
import { playSound } from "@/lib/sounds";

/** A file chosen before the task exists - uploaded right after it's created. */
interface PendingFile {
  id: string;
  file: File;
  /** Referenced from the description as ![name](pending:<id>). */
  inline: boolean;
}

const PENDING_REF = /\]\(pending:([a-z0-9-]+)\)/g;

type CreateDraft = { title: string; description: string; priority: TaskPriority; assigneeId: string; dueDate: string; tags: string };

function splitTags(value: string): string[] {
  return value.split(",").map((tag) => tag.trim()).filter(Boolean);
}

/**
 * New-task dialog with the same fields as editing a task: formatted
 * description, labels (typed or the project's presets), and attachments -
 * picked, pasted or dropped. Attachments can't be uploaded before the task
 * exists, so they're held here and uploaded once it's created; images pasted
 * into the description are written as `pending:` references and rewritten to
 * the uploaded `attachment:<id>` (one follow-up save), exactly what pasting
 * into an existing task produces.
 */
export function CreateTaskDialog({
  projectId,
  status,
  members,
  currentUserId,
  existingTasks,
  columns,
  onClose,
  onCreated,
  returnFocusRef,
}: {
  projectId: string;
  status: TaskStatus | null;
  members: TaskCardMember[];
  currentUserId: string | null;
  existingTasks: Task[];
  columns: readonly BoardColumn[];
  onClose: () => void;
  onCreated: (task: Task) => void;
  returnFocusRef?: { current: HTMLElement | null };
}) {
  const t = useTranslations("work");
  const labelPresets = useLabelPresets();
  // Unsaved text survives a crash or reload (lib/work/task-drafts.ts); the
  // dialog only opens on a click, so reading storage here is client-side.
  const draftKey = currentUserId ? taskDraftKey(currentUserId, `new:${projectId}`) : null;
  const [restored] = useState(() => (draftKey && currentUserId ? readTaskDraft<CreateDraft>(draftKey, currentUserId) : null));
  // One id per task being written: a retry can't create it twice.
  const [clientId] = useState(() => restored?.clientId ?? newTaskId());
  const [title, setTitle] = useState(restored?.form.title ?? "");
  const [description, setDescription] = useState(restored?.form.description ?? "");
  const [priority, setPriority] = useState<TaskPriority>(restored?.form.priority ?? "medium");
  // The project's priorities (060); Medium stays offered even if hidden, as the default.
  const priorities = usePriorities();
  const priorityOptions = priorities.some((p) => p.key === priority) ? priorities : [...priorities, priorityDef(priority)];
  const [assigneeId, setAssigneeId] = useState(restored?.form.assigneeId ?? "");
  const [dueDate, setDueDate] = useState(restored?.form.dueDate ?? "");
  const [tags, setTags] = useState(restored?.form.tags ?? "");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dirty = Boolean(title || description || tags || dueDate || assigneeId || files.length || priority !== "medium");
  // Once the task is created (or the form discarded) no pending debounced
  // write may bring the draft - and its now-used id - back.
  const draftDone = useRef(false);
  const discardDraft = () => { draftDone.current = true; if (draftKey) clearTaskDraft(draftKey); };
  const requestClose = useGuardedClose(dirty, submitting, () => { discardDraft(); onClose(); });
  useEffect(() => {
    if (!draftKey || !currentUserId || !dirty) return;
    const timer = window.setTimeout(() => !draftDone.current && writeTaskDraft<CreateDraft>(draftKey, {
      userId: currentUserId, revision: -1, clientId, form: { title, description, priority, assigneeId, dueDate, tags },
    }), 300);
    return () => window.clearTimeout(timer);
  }, [draftKey, currentUserId, dirty, clientId, title, description, priority, assigneeId, dueDate, tags]);

  // The parent keys this component by target column, so opening the dialog
  // for a different column remounts it with a clean form.
  if (!status) return null;

  const currentTags = splitTags(tags);
  const togglePreset = (name: string) => {
    const has = currentTags.some((tag) => tag.toLowerCase() === name.toLowerCase());
    const next = has ? currentTags.filter((tag) => tag.toLowerCase() !== name.toLowerCase()) : [...currentTags, name];
    setTags(next.join(", "));
  };

  const applyDescriptionEdit = (result: EditResult) => {
    setDescription(result.value);
    requestAnimationFrame(() => {
      const el = descriptionRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  };

  const addFiles = (picked: File[], inline: boolean) => {
    if (picked.length === 0) return;
    // Not crypto.randomUUID(): it only exists on HTTPS/localhost, and a
    // self-hosted install may run on plain HTTP.
    const added = picked.map((file, index) => ({
      id: `${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      inline,
    }));
    setFiles((current) => [...current, ...added]);
    if (!inline) return;
    const el = descriptionRef.current;
    const refs = added.map((entry) => `![${entry.file.name.replace(/[[\]]/g, "")}](pending:${entry.id})`).join("\n");
    setDescription((previous) => {
      const start = el ? Math.min(el.selectionStart ?? previous.length, previous.length) : previous.length;
      const before = previous.slice(0, start);
      const after = previous.slice(start);
      const lead = before && !before.endsWith("\n") ? "\n" : "";
      const trail = after && !after.startsWith("\n") ? "\n" : "";
      return `${before}${lead}${refs}${trail}${after}`;
    });
  };

  const removeFile = (id: string) => {
    setFiles((current) => current.filter((entry) => entry.id !== id));
    // Drop its inline reference too, so no broken image is left behind.
    setDescription((previous) =>
      previous.replace(new RegExp(`!\\[[^\\]]*\\]\\(pending:${id}\\)\\n?`, "g"), "")
    );
  };

  const imagesFrom = (list: FileList | null | undefined) =>
    Array.from(list ?? []).filter((file) => file.type.startsWith("image/"));

  /** Uploads the held files to the new task; returns its final description. */
  const uploadFiles = async (task: Task): Promise<{ description: string | null; failed: number }> => {
    const uploaded = new Map<string, string>();
    let failed = 0;
    for (const entry of files) {
      const formData = new FormData();
      formData.append("file", entry.file);
      const result = await uploadTaskAttachment(projectId, task.id, formData).catch(() => null);
      if (result?.attachment) uploaded.set(entry.id, result.attachment.id);
      else failed += 1;
    }
    if (!files.some((entry) => entry.inline)) return { description: null, failed };
    const finalDescription = (task.description ?? "")
      .replace(PENDING_REF, (_, id: string) => (uploaded.has(id) ? `](attachment:${uploaded.get(id)})` : "]()"))
      .replace(/!\[[^\]]*\]\(\)\n?/g, "");
    return { description: finalDescription, failed };
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentUserId) return;

    setSubmitting(true);
    setError(null);

    try {
      const columnTasks = existingTasks.filter((task) => normalizeTaskStatus(task.status) === status);
      const maxOrder = columnTasks.reduce((max, task) => Math.max(max, task.sort_order ?? 0), 0);

      const result = await timeAction("task.create", () => createTask(projectId, {
        title,
        description,
        status,
        priority,
        assigneeId,
        dueDate,
        sortOrder: maxOrder + 100,
        tags: currentTags,
        clientId,
      }));
      if (result.error || !result.task) throw new Error(result.error ?? t("failedToCreateTask"));

      let task = result.task;
      if (files.length > 0) {
        const { description: rewritten, failed } = await uploadFiles(task);
        if (rewritten !== null && rewritten !== task.description) {
          const saved = await updateTask(projectId, task.id, { description: rewritten || null });
          if (saved.task) task = saved.task;
        }
        if (failed > 0) toast.error(t("createAttachmentsFailed", { count: failed }));
      }

      discardDraft();
      playSound("create");
      onCreated(task);
      onClose();
      toast.success(t("taskCreatedToast", { title: task.title }));
    } catch (err) {
      setError(isNetworkError(err) ? t("networkError") : err instanceof Error ? err.message : t("failedToCreateTask"));
    } finally {
      setSubmitting(false);
    }
  };

  const columnLabel = columns.find((column) => column.status === status)?.label ?? status;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) void requestClose(); }}>
      <DialogContent scrollable className="sm:max-w-xl" onCloseAutoFocus={event => {
        const target = returnFocusRef?.current;
        if (target?.isConnected) { event.preventDefault(); target.focus(); }
      }}>
        <DialogHeader>
          <DialogTitle className="text-base">{t("newTaskDialogTitle")}</DialogTitle>
          <DialogDescription>
            {t.rich("addedToColumn", { column: columnLabel, b: (chunks) => <strong>{chunks}</strong> })}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4" data-save-shortcut>
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="new-task-description">{t("descriptionLabel")}</Label>
              <DescriptionToolbar textareaRef={descriptionRef} apply={applyDescriptionEdit} />
            </div>
            <Textarea
              id="new-task-description"
              ref={descriptionRef}
              rows={4}
              value={description}
              placeholder={t("descriptionPlaceholderTask")}
              onChange={(event) => setDescription(event.target.value)}
              onKeyDown={(event) => descriptionKeyDown(event, applyDescriptionEdit)}
              onPaste={(event) => {
                const images = imagesFrom(event.clipboardData?.files);
                if (images.length === 0) return;
                event.preventDefault();
                addFiles(images, true);
              }}
              onDragOver={(event) => {
                if (Array.from(event.dataTransfer.types).includes("Files")) event.preventDefault();
              }}
              onDrop={(event) => {
                const images = imagesFrom(event.dataTransfer.files);
                if (images.length === 0) return;
                event.preventDefault();
                addFiles(images, true);
              }}
            />
            <p className="text-xs text-muted-foreground">{t("pasteImageHint")}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="new-task-priority">{t("priorityLabel")}</Label>
              <Select
                id="new-task-priority"
                value={priority}
                onChange={(event) => setPriority(event.target.value as TaskPriority)}
              >
                {priorityOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-task-assignee">{t("assigneeLabel")}</Label>
              <Select id="new-task-assignee" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
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
              <DatePicker id="new-task-due" value={dueDate} onChange={setDueDate} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-task-tags">{t("labelsLabel")}</Label>
            <Input
              id="new-task-tags"
              value={tags}
              placeholder={t("labelsPlaceholder")}
              onChange={(event) => setTags(event.target.value)}
            />
            {labelPresets.length > 0 && (
              <div className="flex flex-wrap gap-1.5" aria-label={t("labelPresetsAria")} role="group">
                {labelPresets.map((preset) => {
                  const active = currentTags.some((tag) => tag.toLowerCase() === preset.name.toLowerCase());
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => togglePreset(preset.name)}
                      className={cn("rounded-full transition-opacity", active ? "opacity-100" : "opacity-50 hover:opacity-80")}
                    >
                      <LabelChip name={preset.name} color={preset.color} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{t("attachmentsLabel")}</span>
              <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                <Paperclip className="h-4 w-4" />
                {t("addAttachments")}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(event) => {
                  addFiles(Array.from(event.target.files ?? []), false);
                  event.target.value = "";
                }}
              />
            </div>
            {files.length > 0 && (
              <ul className="space-y-1">
                {files.map((entry) => (
                  <li key={entry.id} className="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-sm">
                    {entry.file.type.startsWith("image/") ? (
                      <ImagePlus className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    ) : (
                      <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    )}
                    <span className="min-w-0 flex-1 truncate">{entry.file.name}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {Math.max(1, Math.round(entry.file.size / 1024))} KB
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFile(entry.id)}
                      aria-label={t("removeAttachment", { name: entry.file.name })}
                      className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {restored && dirty && (
            <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm">
              <span>{t("draftRestored", { time: new Date(restored.savedAt).toLocaleString() })}</span>
              <Button type="button" size="sm" variant="ghost" onClick={() => {
                // Only the restored text goes; what is typed next is drafted again.
                if (draftKey) clearTaskDraft(draftKey);
                setTitle(""); setDescription(""); setPriority("medium"); setAssigneeId(""); setDueDate(""); setTags("");
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

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" size="sm" onClick={() => { void requestClose(); }} disabled={submitting}>
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
