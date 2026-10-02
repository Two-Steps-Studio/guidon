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
    if (!subtaskDraft.trim()) return;

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

  return (
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
  );
}
