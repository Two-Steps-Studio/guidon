"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, FileUp, Loader2, Undo2, Upload } from "lucide-react";
import { useStateMotion } from "@/lib/use-state-motion";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { TaskCardMember } from "@/components/work/task-card";
import type { Task } from "@/types/task";
import { priorityDef, type BoardColumn, type PriorityDef } from "@/lib/work/task-board";
import { findDuplicateTitles, parseTaskImport, resolveImportedTasks, type ParseResult } from "@/lib/work/task-import";
import { importTasks, undoImport } from "./import-tasks-actions";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const PREVIEW_ROWS = 8;

/**
 * Work -> Import: a CSV/JSON/Trello export from another tool, read and
 * mapped in the browser (lib/work/task-import.ts) so the preview shows
 * exactly which columns, priorities and people each task lands on before
 * anything is written. The server action re-checks everything.
 *
 * Tasks whose title is already on the board (or repeats an earlier row) are
 * marked and left out by default, so importing the same export twice doesn't
 * double the board. After an import the dialog stays open with Undo, which
 * takes back every imported task nobody has changed yet (owners/admins).
 */
export function ImportTasksDialog({
  open,
  onOpenChange,
  projectId,
  columns,
  priorities,
  members,
  existingTitles,
  canUndo,
  onImported,
  onUndone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  columns: readonly BoardColumn[];
  priorities: PriorityDef[];
  members: TaskCardMember[];
  /** Titles of the tasks already on the board - for spotting duplicates. */
  existingTitles: string[];
  /** Owners/admins: may delete tasks, so may undo an import. */
  canUndo: boolean;
  /** Adds the created tasks to the board's own state. */
  onImported: (tasks: Task[]) => void;
  /** Removes undone tasks from the board's own state. */
  onUndone: (taskIds: string[]) => void;
}) {
  const t = useTranslations("work");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [importing, startImport] = useTransition();
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [imported, setImported] = useState<Task[] | null>(null);
  const [importedCount, setImportedCount] = useState(0);
  const [undoMessage, setUndoMessage] = useState<string | null>(null);

  const parsed: ParseResult | null = useMemo(() => (text.trim() ? parseTaskImport(text, fileName) : null), [text, fileName]);
  const resolved = useMemo(
    () =>
      parsed
        ? resolveImportedTasks(parsed.tasks, {
            columns: columns.map((c) => ({ status: c.status, label: c.label })),
            priorities: priorities.map((p) => ({ key: p.key, label: p.label })),
            members,
          })
        : null,
    [parsed, columns, priorities, members]
  );

  const duplicates = useMemo(
    () => (resolved ? findDuplicateTitles(resolved.tasks, existingTitles) : null),
    [resolved, existingTitles]
  );
  const isDuplicate = (index: number) => Boolean(duplicates && (duplicates.onBoard.has(index) || duplicates.inFile.has(index)));
  const toImport = useMemo(
    () =>
      resolved
        ? resolved.tasks.filter(
            (_, index) => !(skipDuplicates && duplicates && (duplicates.onBoard.has(index) || duplicates.inFile.has(index)))
          )
        : [],
    [resolved, duplicates, skipDuplicates]
  );
  const duplicateCount = (duplicates?.onBoard.size ?? 0) + (duplicates?.inFile.size ?? 0);

  const reset = () => {
    setText("");
    setFileName("");
    setFileError(null);
    setImported(null);
    setUndoMessage(null);
    setSkipDuplicates(true);
  };

  const readFile = async (file: File | undefined) => {
    setFileError(null);
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setFileError(t("importFileTooLarge"));
      return;
    }
    setFileName(file.name);
    setText(await file.text());
  };

  const submit = () => {
    if (!toImport.length) return;
    startImport(async () => {
      const result = await importTasks(projectId, toImport);
      onImported(result.tasks);
      if (result.error) {
        toast.error(result.error);
        if (result.tasks.length) {
          setImported(result.tasks);
          setImportedCount(result.tasks.length);
        }
        return;
      }
      setImported(result.tasks);
      setImportedCount(result.tasks.length);
    });
  };

  const undo = () => {
    if (!imported?.length) return;
    startImport(async () => {
      const result = await undoImport(projectId, imported.map((task) => task.id));
      if (result.removed.length) onUndone(result.removed);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      const message = [
        t("importUndone", { count: result.removed.length }),
        result.kept ? t("importUndoKept", { count: result.kept }) : "",
      ].filter(Boolean).join(" ");
      setUndoMessage(message);
      setImported((current) => current?.filter((task) => !result.removed.includes(task.id)) ?? null);
    });
  };

  const columnLabel = (status: string) => columns.find((c) => c.status === status)?.label ?? status;
  const memberName = (id: string | null) => {
    const member = id ? members.find((m) => m.id === id) : null;
    return member ? member.full_name || member.email : "-";
  };

  // Same fallback as resolveImportedTasks: Backlog if shown, else the first column.
  const fallbackStatus = columns.find((c) => c.status === "backlog")?.status ?? columns[0]?.status ?? "backlog";
  const unmatched = resolved?.unmatched;
  const warnings = [
    ...(parsed?.warnings ?? []),
    ...(unmatched?.statuses.length ? [t("importUnmatchedStatuses", { values: unmatched.statuses.join(", "), column: columnLabel(fallbackStatus) })] : []),
    ...(unmatched?.priorities.length ? [t("importUnmatchedPriorities", { values: unmatched.priorities.join(", ") })] : []),
    ...(unmatched?.assignees.length ? [t("importUnmatchedAssignees", { values: unmatched.assignees.join(", ") })] : []),
  ];

  const { ref: resultRef, inputHandlers: resultInputHandlers } = useStateMotion<HTMLSpanElement>(imported);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !importing) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent {...resultInputHandlers} className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("importTitle")}</DialogTitle>
          <DialogDescription>{t("importDescription")}</DialogDescription>
        </DialogHeader>

        {imported ? (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm font-medium">
              <span ref={resultRef} className="inline-flex" data-state-motion="import-result"><CheckCircle2 className="h-4 w-4 text-success" /></span>
              {t("importDoneTitle", { count: importedCount })}
            </p>
            {undoMessage ? (
              <p role="status" className="text-sm text-muted-foreground">{undoMessage}</p>
            ) : canUndo ? (
              <p className="text-sm text-muted-foreground">{t("importDoneHint")}</p>
            ) : (
              <p className="text-sm text-muted-foreground">{t("importUndoNotAllowed")}</p>
            )}
            <div className="flex justify-end gap-2">
              {canUndo && !undoMessage && imported.length > 0 && (
                <Button type="button" variant="outline" onClick={undo} disabled={importing}>
                  {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
                  {t("importUndo")}
                </Button>
              )}
              <Button
                type="button"
                onClick={() => {
                  reset();
                  onOpenChange(false);
                }}
                disabled={importing}
              >
                {t("importClose")}
              </Button>
            </div>
          </div>
        ) : (
        <div className="space-y-3">
          <label
            className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border px-4 py-6 text-sm text-muted-foreground hover:border-foreground/40 hover:text-foreground"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              void readFile(event.dataTransfer.files[0]);
            }}
          >
            <FileUp className="h-5 w-5" />
            {fileName || t("importChooseFile")}
            <input
              type="file"
              accept=".csv,.tsv,.txt,.json,text/csv,application/json"
              className="sr-only"
              onChange={(event) => {
                void readFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>

          <Textarea
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setFileName("");
            }}
            placeholder={t("importPastePlaceholder")}
            rows={4}
            className="font-mono text-xs"
            aria-label={t("importPasteAria")}
          />

          {fileError && <p className="text-sm text-destructive">{fileError}</p>}

          {parsed && resolved && (
            <div className="space-y-2">
              <p className="text-sm font-medium">
                {resolved.tasks.length
                  ? t("importFound", { count: resolved.tasks.length, format: parsed.format.toUpperCase() })
                  : t("importNothingFound")}
              </p>

              {duplicateCount > 0 && duplicates && (
                <div className="space-y-1 rounded-md border border-border bg-muted/50 p-2 text-xs">
                  {duplicates.onBoard.size > 0 && <p>{t("importDuplicatesOnBoard", { count: duplicates.onBoard.size })}</p>}
                  {duplicates.inFile.size > 0 && <p>{t("importDuplicatesInFile", { count: duplicates.inFile.size })}</p>}
                  <label className="flex items-center gap-2 font-medium">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5"
                      checked={skipDuplicates}
                      onChange={(event) => setSkipDuplicates(event.target.checked)}
                    />
                    {t("importSkipDuplicates")}
                  </label>
                </div>
              )}

              {warnings.length > 0 && (
                <ul className="space-y-1 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs">
                  {warnings.map((warning) => (
                    <li key={warning} className="flex gap-1.5">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                      {warning}
                    </li>
                  ))}
                </ul>
              )}

              {resolved.tasks.length > 0 && (
                <div className="max-h-64 overflow-auto rounded-md border border-border">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-muted text-muted-foreground">
                      <tr>
                        <th className="px-2 py-1.5 font-medium">{t("titleLabel")}</th>
                        <th className="px-2 py-1.5 font-medium">{t("statusLabel")}</th>
                        <th className="px-2 py-1.5 font-medium">{t("priorityLabel")}</th>
                        <th className="px-2 py-1.5 font-medium">{t("assigneeLabel")}</th>
                        <th className="px-2 py-1.5 font-medium">{t("dueDateLabel")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resolved.tasks.slice(0, PREVIEW_ROWS).map((task, index) => (
                        <tr key={index} className="border-t border-border">
                          <td className="max-w-64 truncate px-2 py-1.5">
                            {isDuplicate(index) && (
                              <span className="mr-1.5 rounded border border-border px-1 text-[10px] text-muted-foreground">
                                {t("importDuplicateBadge")}
                              </span>
                            )}
                            {task.title}
                          </td>
                          <td className="px-2 py-1.5">{columnLabel(task.status)}</td>
                          <td className="px-2 py-1.5">{priorityDef(task.priority, priorities).label}</td>
                          <td className="px-2 py-1.5">{memberName(task.assigneeId)}</td>
                          <td className="px-2 py-1.5 tabular-nums">{task.dueDate ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {resolved.tasks.length > PREVIEW_ROWS && (
                    <p className="border-t border-border px-2 py-1.5 text-xs text-muted-foreground">
                      {t("importMore", { count: resolved.tasks.length - PREVIEW_ROWS })}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>
              {t("cancel")}
            </Button>
            <Button type="button" onClick={submit} disabled={importing || !toImport.length}>
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {t("importSubmit", { count: toImport.length })}
            </Button>
          </div>
        </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
