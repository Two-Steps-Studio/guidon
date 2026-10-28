"use client";

import { useEffect, useState } from "react";
import { Bot, Loader2, Undo2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { TaskCardMember } from "@/components/work/task-card";
import { loadTaskAppChanges, undoTaskAppChange, type TaskAppChange } from "@/app/projects/[id]/work/app-changes-actions";
import { isRestorable, type FieldValue, type TrackedTaskField } from "@/lib/work/app-changes-core";
import type { BoardColumn } from "@/lib/work/task-board";
import type { Task } from "@/types/task";

/**
 * "Changes by apps": what an AI app, an agent or an integration changed on
 * this task - which app, on whose behalf, and every field before and after -
 * with Undo. Hidden when no app has touched the task, so a team that doesn't
 * connect AI never sees it.
 */
export function TaskAppChangesSection({
  projectId,
  taskId,
  members,
  columns,
  priorities,
  canEdit,
  onUndone,
}: {
  projectId: string;
  taskId: string;
  members: TaskCardMember[];
  columns: readonly BoardColumn[];
  priorities: readonly { key: string; label: string }[];
  canEdit: boolean;
  onUndone: (task: Task) => void;
}) {
  const t = useTranslations("work.appChanges");
  const format = useFormatter();
  const [changes, setChanges] = useState<TaskAppChange[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void loadTaskAppChanges(projectId, taskId)
      .then((result) => {
        if (!active) return;
        setChanges(result.changes);
        setError(result.error);
      })
      .catch(() => active && setError(t("loadFailed")));
    return () => {
      active = false;
    };
  }, [projectId, taskId, t]);

  if (!error && changes.length === 0) return null;

  const person = (userId: string | null) => {
    const member = userId ? members.find((m) => m.id === userId) : undefined;
    return member?.full_name || member?.email || null;
  };
  const show = (field: TrackedTaskField, value: FieldValue) => {
    if (value === null) return t("empty");
    if (field === "status") return columns.find((column) => column.status === value)?.label ?? value;
    if (field === "priority") return priorities.find((priority) => priority.key === value)?.label ?? value;
    if (field === "due_date") return format.dateTime(new Date(value), { dateStyle: "medium" });
    return value.length > 140 ? `${value.slice(0, 140)}…` : value;
  };

  const undo = async (change: TaskAppChange) => {
    setUndoingId(change.id);
    setError(null);
    setNotice(null);
    try {
      const result = await undoTaskAppChange(projectId, taskId, change.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setChanges((current) => current.map((item) => (item.id === change.id ? { ...item, undone: true } : item)));
      if (result.changedSince.length) {
        setNotice(t("changedSince", { fields: result.changedSince.map((field) => t(`field.${field}`)).join(", ") }));
      }
      if (result.task) onUndone(result.task);
    } catch {
      setError(t("undoFailed"));
    } finally {
      setUndoingId(null);
    }
  };

  return (
    <section className="space-y-2 border-t border-border pt-4" aria-labelledby={`app-changes-${taskId}`}>
      <h3 id={`app-changes-${taskId}`} className="flex items-center gap-1.5 text-sm font-semibold">
        <Bot className="h-4 w-4 text-muted-foreground" aria-hidden />
        {t("title")}
      </h3>
      <p className="text-xs text-muted-foreground">{t("hint")}</p>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      {notice && <p role="status" className="text-xs text-muted-foreground">{notice}</p>}
      <ul className="space-y-2">
        {changes.map((change) => {
          const fields = Object.entries(change.changes) as [TrackedTaskField, { from: FieldValue; to: FieldValue }][];
          const restorable = fields.some(([, value]) => isRestorable(value));
          const who = person(change.userId);
          return (
            <li key={change.id} className="rounded-md border border-border p-2.5 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{change.appName ?? t("unknownApp")}</span>
                  {who && <> · {t("onBehalfOf", { person: who })}</>}
                  {" · "}
                  {format.dateTime(new Date(change.createdAt), { dateStyle: "medium", timeStyle: "short" })}
                </p>
                {change.undone ? (
                  <span className="text-xs text-muted-foreground">{t("undone")}</span>
                ) : (
                  canEdit && restorable && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7"
                      disabled={undoingId !== null}
                      onClick={() => void undo(change)}
                    >
                      {undoingId === change.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
                      {t("undo")}
                    </Button>
                  )
                )}
              </div>
              <dl className="mt-1.5 space-y-1">
                {fields.map(([field, value]) => (
                  <div key={field} className="grid grid-cols-[6rem_1fr] gap-2 text-xs">
                    <dt className="text-muted-foreground">{t(`field.${field}`)}</dt>
                    <dd className="min-w-0 break-words">
                      <del className="text-muted-foreground">{show(field, value.from)}</del>
                      <span aria-hidden> → </span>
                      <span className="sr-only">{t("changedTo")}</span>
                      <ins className="no-underline">{show(field, value.to)}</ins>
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
