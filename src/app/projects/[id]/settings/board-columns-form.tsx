"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertCircle, ArrowDown, ArrowUp, Check, Columns3, Eye, EyeOff, Flag, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  BOARD_COLUMNS,
  PRIORITY_DOT_CLASSES,
  isBuiltinPriority,
  resolveAllBoardColumns,
  resolvePriorities,
  type BoardColumnOverride,
  type PriorityOverride,
} from "@/lib/work/task-board";
import { updateBoardColumns, updatePriorities } from "./board-columns-actions";

/**
 * Settings -> Board columns and Priorities (migrations 020/060). Both edit
 * an ordered list where the built-in entries can be renamed, recoloured,
 * reordered and hidden, and the project can add (and remove) its own. A new
 * entry's key - what tasks store and the API/plugins use - is made from its
 * name when it is first saved and never changes afterwards.
 */

interface Row {
  key: string;
  label: string;
  /** The built-in name, used as the placeholder when the label is cleared. */
  defaultLabel: string;
  color: string | null;
  hidden: boolean;
  isDone: boolean;
  builtin: boolean;
  isNew: boolean;
  /** Token class of a built-in's default dot colour. */
  defaultDotClass: string;
}

/** A readable, unique key from a new entry's name: "Code review" -> "code_review". */
function keyFor(label: string, taken: Set<string>): string {
  const base =
    label
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/^(?=[0-9])/, "c_")
      .slice(0, 34) || "custom";
  let key = base;
  for (let n = 2; taken.has(key); n++) key = `${base}_${n}`;
  return key;
}

function withKeys(rows: Row[]): Row[] {
  const taken = new Set(rows.filter((row) => !row.isNew).map((row) => row.key));
  return rows.map((row) => {
    if (!row.isNew) return row;
    const key = keyFor(row.label, taken);
    taken.add(key);
    return { ...row, key };
  });
}

function ListEditor({
  icon: Icon,
  title,
  description,
  initialRows,
  showDoneToggle,
  onSave,
  saveLabel,
  addLabel,
}: {
  icon: typeof Columns3;
  title: string;
  description: string;
  initialRows: Row[];
  showDoneToggle: boolean;
  onSave: (rows: Row[]) => Promise<{ error: string | null }>;
  saveLabel: string;
  addLabel: string;
}) {
  const t = useTranslations("settings");
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const update = (index: number, patch: Partial<Row>) => {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    setSaved(false);
  };
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    const next = rows.slice();
    [next[index], next[target]] = [next[target], next[index]];
    setRows(next);
    setSaved(false);
  };
  const add = () => {
    setRows((current) => [
      ...current,
      {
        key: `new_${current.length}`,
        label: "",
        defaultLabel: "",
        color: "#64748b",
        hidden: false,
        isDone: false,
        builtin: false,
        isNew: true,
        defaultDotClass: "",
      },
    ]);
    setSaved(false);
  };

  const save = () => {
    setError(null);
    startSaving(async () => {
      const keyed = withKeys(rows);
      const result = await onSave(keyed);
      if (result.error) setError(result.error);
      else {
        setRows(keyed.map((row) => ({ ...row, isNew: false })));
        setSaved(true);
        router.refresh();
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="h-5 w-5" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-2">
          {rows.map((row, index) => (
            <li
              key={row.isNew ? `new-${index}` : row.key}
              className={cn("flex flex-wrap items-center gap-2 rounded-md border border-border p-2", row.hidden && "opacity-50")}
            >
              <div className="flex flex-col">
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  aria-label={t("moveUpAria", { label: row.label || row.defaultLabel })}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={index === rows.length - 1}
                  onClick={() => move(index, 1)}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  aria-label={t("moveDownAria", { label: row.label || row.defaultLabel })}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Colour: a built-in keeps its theme colour until one is picked. */}
              <label
                className={cn(
                  "relative h-6 w-6 shrink-0 cursor-pointer overflow-hidden rounded-full border border-border",
                  !row.color && row.defaultDotClass
                )}
                style={row.color ? { backgroundColor: row.color } : undefined}
                title={t("workflowColor")}
              >
                <input
                  type="color"
                  value={row.color ?? "#64748b"}
                  onChange={(event) => update(index, { color: event.target.value })}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  aria-label={t("workflowColor")}
                />
              </label>
              {row.builtin && row.color && (
                <button
                  type="button"
                  onClick={() => update(index, { color: null })}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  {t("workflowDefaultColor")}
                </button>
              )}

              <Input
                value={row.label}
                placeholder={row.defaultLabel || t("workflowNamePlaceholder")}
                maxLength={50}
                onChange={(event) => update(index, { label: event.target.value })}
                className="h-8 min-w-40 flex-1"
                aria-label={t("workflowName")}
              />

              {showDoneToggle && (
                <label
                  className={cn("flex items-center gap-1.5 text-xs", row.builtin ? "text-muted-foreground" : "")}
                  title={t("columnCountsAsDoneHelp")}
                >
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5"
                    checked={row.isDone}
                    disabled={row.builtin}
                    onChange={(event) => update(index, { isDone: event.target.checked })}
                  />
                  {t("columnCountsAsDone")}
                </label>
              )}

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => update(index, { hidden: !row.hidden })}
                title={row.hidden ? t("hiddenClickToShow") : t("visibleClickToHide")}
              >
                {row.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              {!row.builtin && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => {
                    setRows((current) => current.filter((_, i) => i !== index));
                    setSaved(false);
                  }}
                  aria-label={t("workflowRemove", { label: row.label || row.key })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>

        <Button type="button" variant="outline" size="sm" onClick={add}>
          <Plus className="mr-1.5 h-4 w-4" />
          {addLabel}
        </Button>

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button type="button" onClick={save} disabled={saving}>
            <Check className="mr-2 h-4 w-4" />
            {saving ? t("saving") : saveLabel}
          </Button>
          {saved && !saving && <span className="text-sm text-success">{t("saved")}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

export function BoardColumnsForm({ projectId, overrides }: { projectId: string; overrides: BoardColumnOverride[] }) {
  const t = useTranslations("settings");
  const tWork = useTranslations("work");
  const initialRows: Row[] = resolveAllBoardColumns(overrides, (status) => ({
    label: tWork("status", { status }),
    hint: "",
  })).map(({ column, hidden }) => {
    const builtin = !column.custom;
    const saved = overrides.find((o) => o.status === column.status);
    return {
      key: column.status,
      // Built-ins show their saved name, or the default as placeholder only.
      label: builtin ? saved?.label ?? "" : column.label,
      defaultLabel: builtin ? tWork("status", { status: column.status }) : "",
      color: column.color ?? null,
      hidden,
      isDone: column.isDone,
      builtin,
      isNew: false,
      defaultDotClass: BOARD_COLUMNS.find((c) => c.status === column.status)?.accentClass ?? "",
    };
  });

  return (
    <ListEditor
      icon={Columns3}
      title={t("boardColumnsTitle")}
      description={t("boardColumnsDescription")}
      initialRows={initialRows}
      showDoneToggle
      saveLabel={t("saveBoardLayout")}
      addLabel={t("addColumn")}
      onSave={(rows) =>
        updateBoardColumns(
          projectId,
          rows.map((row, index) => ({
            status: row.key,
            label: row.label,
            sort_order: index,
            hidden: row.hidden,
            is_done: row.isDone,
            color: row.color,
          }))
        )
      }
    />
  );
}

export function PrioritiesForm({ projectId, overrides }: { projectId: string; overrides: PriorityOverride[] }) {
  const t = useTranslations("settings");
  const tWork = useTranslations("work");
  const initialRows: Row[] = resolvePriorities(overrides, (key) => tWork("priority", { priority: key }), true).map((priority) => {
    const builtin = !priority.custom;
    const saved = overrides.find((o) => o.key === priority.key);
    return {
      key: priority.key,
      label: builtin ? saved?.label ?? "" : priority.label,
      defaultLabel: builtin ? tWork("priority", { priority: priority.key }) : "",
      color: priority.color,
      hidden: priority.hidden,
      isDone: false,
      builtin,
      isNew: false,
      defaultDotClass: isBuiltinPriority(priority.key) ? PRIORITY_DOT_CLASSES[priority.key] : "",
    };
  });

  return (
    <ListEditor
      icon={Flag}
      title={t("prioritiesTitle")}
      description={t("prioritiesDescription")}
      initialRows={initialRows}
      showDoneToggle={false}
      saveLabel={t("savePriorities")}
      addLabel={t("addPriority")}
      onSave={(rows) =>
        updatePriorities(
          projectId,
          rows.map((row) => ({ key: row.key, label: row.label, color: row.color, hidden: row.hidden }))
        )
      }
    />
  );
}
