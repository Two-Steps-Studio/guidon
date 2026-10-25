"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Plus, X } from "lucide-react";
import { createSubtask, deleteTask, updateTask } from "@/app/projects/[id]/work/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { BOARD_COLUMNS, isDone, normalizeTaskStatus, type BoardColumn } from "@/lib/work/task-board";
import type { Task, TaskStatus } from "@/types/task";
import { playSound } from "@/lib/sounds";

/**
 * A subtask can be sitting on a status the project has since hidden from
 * the board (same reasoning as the parent task's own status options) - keep
 * it selectable rather than silently omitting it from the dropdown.
 */
function subtaskStatusOptions(
  status: TaskStatus,
  columns: readonly BoardColumn[]
): readonly BoardColumn[] {
  return columns.some((c) => c.status === status)
    ? columns
    : [...columns, BOARD_COLUMNS.find((c) => c.status === status)!];
}

/**
 * Subtasks (migration 010) of one task: inline rename (Enter commits, Esc
 * cancels), status select, delete, and an add row. Subtasks are plain
 * tasks, so every change goes out through the same onSaved/onDeleted
 * callbacks the board uses for top-level tasks.
 *
 * The title inputs carry data-subtask-title-field so the task dialog's
 * Escape handler lets Esc cancel a rename instead of closing the dialog.
 */
export function TaskSubtasksSection({
  projectId,
  task,
  subtasks,
  columns,
  canEdit,
  canDelete,
  onSaved,
  onDeleted,
}: {
  projectId: string;
  task: Task;
  subtasks: Task[];
  columns: readonly BoardColumn[];
  canEdit: boolean;
  canDelete: boolean;
  onSaved: (task: Task) => void;
  onDeleted: (taskId: string) => void;
}) {
  const t = useTranslations("work");
  const [subtaskDraft, setSubtaskDraft] = useState("");
  const [pendingSubtasks, setPendingSubtasks] = useState<{ id: string; title: string }[]>([]);
  const [hiddenSubtaskIds, setHiddenSubtaskIds] = useState<ReadonlySet<string>>(new Set());
  const [subtaskError, setSubtaskError] = useState<string | null>(null);
  const [savingSubtaskId, setSavingSubtaskId] = useState<string | null>(null);
  // Keyed by subtask id. Only holds an entry while that row has an
  // in-flight or not-yet-committed edit - absence means "show the row's
  // own field". Successful saves clear the entry; failures preserve the
  // person's text and its original revision until they recover or cancel.
  const [subtaskTitleDrafts, setSubtaskTitleDrafts] = useState<Record<string, string>>({});
  const subtaskTitleVersions = useRef(new Map<string, number>());
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

  // Optimistic: a new subtask shows (dimmed) as soon as it's added and the
  // input is free for the next one; a deleted one disappears at once. A
  // failed request puts things back and says why.
  const handleAddSubtask = async (event: React.FormEvent) => {
    event.preventDefault();
    const title = subtaskDraft.trim();
    if (!title) return;

    const pendingId = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setPendingSubtasks((current) => [...current, { id: pendingId, title }]);
    setSubtaskDraft("");
    setSubtaskError(null);

    try {
      const result = await createSubtask(projectId, task.id, title);
      if (result.error || !result.task) throw new Error(result.error ?? t("failedToCreateSubtask"));

      // Subtasks are plain tasks, so the same onSaved callback that updates
      // the board's task list handles them - no separate state to sync.
      onSaved(result.task);
    } catch (err) {
      setSubtaskDraft((current) => (current ? current : title));
      setSubtaskError(err instanceof Error ? err.message : t("failedToCreateSubtask"));
    } finally {
      setPendingSubtasks((current) => current.filter((pending) => pending.id !== pendingId));
    }
  };

  const handleSubtaskStatusChange = async (subtask: Task, status: TaskStatus) => {
    // Set immediately so the (now-disabled) <Select> shows the chosen value
    // for the duration of the request instead of snapping back to the old
    // one until `onSaved` updates `subtask` from the parent.
    setSubtaskStatusDrafts((current) => ({ ...current, [subtask.id]: status }));
    setSavingSubtaskId(subtask.id);
    setSubtaskError(null);

    try {
      const result = await updateTask(projectId, subtask.id, { status });
      if (result.error || !result.task) throw new Error(result.error ?? t("failedToUpdateSubtask"));

      if (result.task.is_done && !subtask.is_done) playSound("complete");
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
      subtaskTitleVersions.current.delete(subtask.id);
      return;
    }

    setSavingSubtaskId(subtask.id);
    setSubtaskError(null);

    try {
      const result = await updateTask(projectId, subtask.id, { title: draft }, subtaskTitleVersions.current.get(subtask.id) ?? subtask.revision ?? -1);
      if (result.error || !result.task) throw new Error(result.error ?? t("failedToRenameSubtask"));

      onSaved(result.task);
      clearDraft(setSubtaskTitleDrafts, subtask.id);
      subtaskTitleVersions.current.delete(subtask.id);
    } catch (err) {
      // Preserve both the text and its original version after a failed save.
      setSubtaskError(err instanceof Error ? err.message : t("failedToRenameSubtask"));
    } finally {
      setSavingSubtaskId(null);
    }
  };

  const handleDeleteSubtask = async (subtaskId: string) => {
    setHiddenSubtaskIds((current) => new Set(current).add(subtaskId));
    setSubtaskError(null);

    try {
      const result = await deleteTask(projectId, subtaskId);
      if (result.error) throw new Error(result.error);

      onDeleted(subtaskId);
    } catch (err) {
      setSubtaskError(err instanceof Error ? err.message : t("failedToDeleteSubtask"));
    } finally {
      setHiddenSubtaskIds((current) => {
        const next = new Set(current);
        next.delete(subtaskId);
        return next;
      });
    }
  };

  const visibleSubtasks = subtasks.filter((subtask) => !hiddenSubtaskIds.has(subtask.id));

  return (
        <section
          aria-label={t("subtasksAria")}
          className="space-y-3 border-t border-border pt-4"
        >
          <h3 className="text-sm font-medium text-foreground">
            {t("subtasksHeading")}
            {visibleSubtasks.length + pendingSubtasks.length > 0 && (
              <span className="ml-1.5 text-xs font-normal tabular-nums text-muted-foreground">
                {visibleSubtasks.filter((subtask) => isDone(subtask.status)).length}/{visibleSubtasks.length + pendingSubtasks.length}
              </span>
            )}
          </h3>

          {visibleSubtasks.length + pendingSubtasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noSubtasksYet")}</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <tbody>
                {visibleSubtasks.map((subtask) => {
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
                          onFocus={() => { if (!Object.hasOwn(subtaskTitleDrafts, subtask.id)) subtaskTitleVersions.current.set(subtask.id, subtask.revision ?? -1); }}
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
                              subtaskTitleVersions.current.delete(subtask.id);
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
                            onClick={() => void handleDeleteSubtask(subtask.id)}
                            className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 max-md:opacity-100"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {pendingSubtasks.map((pending) => (
                  <tr key={pending.id} aria-busy="true" className="opacity-60">
                    <td className="w-full py-1 pr-2">
                      <span className="flex h-8 items-center px-3">{pending.title}</span>
                    </td>
                    <td className="py-1 pr-2" colSpan={2}>
                      <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    </td>
                  </tr>
                ))}
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
                onChange={(event) => setSubtaskDraft(event.target.value)}
              />
              <Button
                type="submit"
                size="icon"
                aria-label={t("addSubtaskButtonAria")}
                disabled={!subtaskDraft.trim()}
                className="shrink-0"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </form>
          )}
        </section>
  );
}
