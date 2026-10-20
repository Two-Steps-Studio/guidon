"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, FileUp, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { TaskCardMember } from "@/components/work/task-card";
import type { Task } from "@/types/task";
import { priorityDef, type BoardColumn, type PriorityDef } from "@/lib/work/task-board";
import { parseTaskImport, resolveImportedTasks, type ParseResult } from "@/lib/work/task-import";
import { importTasks } from "./import-tasks-actions";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const PREVIEW_ROWS = 8;

/**
 * Work -> Import: a CSV/JSON/Trello export from another tool, read and
 * mapped in the browser (lib/work/task-import.ts) so the preview shows
 * exactly which columns, priorities and people each task lands on before
 * anything is written. The server action re-checks everything.
 */
export function ImportTasksDialog({
  open,
  onOpenChange,
  projectId,
  columns,
  priorities,
  members,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  columns: readonly BoardColumn[];
  priorities: PriorityDef[];
  members: TaskCardMember[];
  /** Adds the created tasks to the board's own state. */
  onImported: (tasks: Task[]) => void;
}) {
  const t = useTranslations("work");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [importing, startImport] = useTransition();

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

  const reset = () => {
    setText("");
    setFileName("");
    setFileError(null);
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
    if (!resolved?.tasks.length) return;
    startImport(async () => {
      const result = await importTasks(projectId, resolved.tasks);
      onImported(result.tasks);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(t("importDone", { count: result.count }));
      reset();
      onOpenChange(false);
    });
  };

  const columnLabel = (status: string) => columns.find((c) => c.status === status)?.label ?? status;
  const memberName = (id: string | null) => {
    const member = id ? members.find((m) => m.id === id) : null;
    return member ? member.full_name || member.email : "—";
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

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !importing) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("importTitle")}</DialogTitle>
          <DialogDescription>{t("importDescription")}</DialogDescription>
        </DialogHeader>

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
                          <td className="max-w-64 truncate px-2 py-1.5">{task.title}</td>
                          <td className="px-2 py-1.5">{columnLabel(task.status)}</td>
                          <td className="px-2 py-1.5">{priorityDef(task.priority, priorities).label}</td>
                          <td className="px-2 py-1.5">{memberName(task.assigneeId)}</td>
                          <td className="px-2 py-1.5 tabular-nums">{task.dueDate ?? "—"}</td>
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
            <Button type="button" onClick={submit} disabled={importing || !resolved?.tasks.length}>
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {t("importSubmit", { count: resolved?.tasks.length ?? 0 })}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
