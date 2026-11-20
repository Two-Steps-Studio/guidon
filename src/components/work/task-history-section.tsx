"use client";

import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { TaskCardMember } from "@/components/work/task-card";
import { loadTaskHistory, type TaskHistoryEntry } from "@/app/projects/[id]/work/history-actions";
import type { BoardColumn } from "@/lib/work/task-board";

/** Fields with a translated name; any other changed field shows under "other details". */
const NAMED_FIELDS = [
  "title",
  "description",
  "status",
  "priority",
  "assignee_id",
  "due_date",
  "tags",
  "parent_task_id",
  "progress_percent",
  "estimated_hours",
  "actual_hours",
  "decision_id",
  "recurrence_rule",
  "checklist",
] as const;

/** Set alongside another change (a move to Done), so they'd only repeat it. */
const FOLLOW_ON_FIELDS = new Set(["is_done", "done_at"]);

const SHOWN_AT_FIRST = 5;

/**
 * "History": who changed this task, when and what (status before/after,
 * the names of other changed fields) - people and AI alike, read from the
 * Context Engine log the database already writes on every change.
 */
export function TaskHistorySection({
  projectId,
  taskId,
  members,
  columns,
}: {
  projectId: string;
  taskId: string;
  members: TaskCardMember[];
  columns: readonly BoardColumn[];
}) {
  const t = useTranslations("work.history");
  const format = useFormatter();
  const [entries, setEntries] = useState<TaskHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let active = true;
    void loadTaskHistory(projectId, taskId)
      .then((result) => {
        if (!active) return;
        setEntries(result.entries);
        setError(result.error);
      })
      .catch(() => active && setError(t("loadFailed")));
    return () => {
      active = false;
    };
  }, [projectId, taskId, t]);

  if (!error && (!entries || entries.length === 0)) return null;

  const person = (userId: string | null) => {
    const member = userId ? members.find((m) => m.id === userId) : undefined;
    return member?.full_name || member?.email || t("someone");
  };
  const status = (value: string | undefined) => columns.find((column) => column.status === value)?.label ?? value ?? "";
  const fieldName = (field: string) => (isNamedField(field) ? t(`field.${field}`) : t("field.other"));

  const changedFields = (entry: TaskHistoryEntry) => (entry.payload.fields ?? []).filter((field) => !FOLLOW_ON_FIELDS.has(field));
  const describe = (entry: TaskHistoryEntry) => {
    if (entry.event_type === "task.created") return t("created");
    if (entry.event_type === "task.status_changed" && entry.payload.from && entry.payload.to) {
      const others = changedFields(entry).filter((field) => field !== "status");
      const moved = t("statusChanged", { from: status(entry.payload.from), to: status(entry.payload.to) });
      return others.length ? `${moved}; ${t("changed", { fields: unique(others.map(fieldName)).join(", ") })}` : moved;
    }
    return t("changed", { fields: unique(changedFields(entry).map(fieldName)).join(", ") || t("field.other") });
  };

  const visible = showAll ? entries ?? [] : (entries ?? []).slice(0, SHOWN_AT_FIRST);

  return (
    <section className="space-y-2 border-t border-border pt-4" aria-labelledby={`task-history-${taskId}`}>
      <h3 id={`task-history-${taskId}`} className="flex items-center gap-1.5 text-sm font-semibold">
        <History className="h-4 w-4 text-muted-foreground" aria-hidden />
        {t("title")}
      </h3>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <ol className="space-y-1.5">
        {visible.map((entry) => (
          <li key={entry.id} className="text-sm">
            <span className="font-medium">{person(entry.actor_id)}</span> <span className="text-muted-foreground">{describe(entry)}</span>
            <span className="block text-xs text-muted-foreground">
              <time dateTime={entry.occurred_at}>{format.dateTime(new Date(entry.occurred_at), { dateStyle: "medium", timeStyle: "short" })}</time>
            </span>
          </li>
        ))}
      </ol>
      {(entries?.length ?? 0) > SHOWN_AT_FIRST && (
        <Button type="button" variant="ghost" size="sm" className="-ml-2" onClick={() => setShowAll((value) => !value)}>
          {showAll ? t("showLess") : t("showAll", { count: entries?.length ?? 0 })}
        </Button>
      )}
    </section>
  );
}

function isNamedField(field: string): field is (typeof NAMED_FIELDS)[number] {
  return (NAMED_FIELDS as readonly string[]).includes(field);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
