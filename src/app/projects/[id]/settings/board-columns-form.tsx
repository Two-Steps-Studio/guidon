"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AlertCircle, Check, Columns3, Eye, EyeOff, GripVertical } from "lucide-react";
import { BOARD_COLUMNS } from "@/lib/work/task-board";
import { updateBoardColumns, type BoardColumnInput } from "./board-columns-actions";
import type { BoardColumnOverride } from "@/lib/work/task-board";

function initialRows(overrides: BoardColumnOverride[]): BoardColumnInput[] {
  const byStatus = new Map(overrides.map((o) => [o.status, o]));
  return BOARD_COLUMNS.map((column, index) => {
    const override = byStatus.get(column.status);
    return {
      status: column.status,
      label: override?.label ?? column.label,
      sort_order: override?.sort_order ?? index,
      hidden: override?.hidden ?? false,
    };
  }).sort((a, b) => a.sort_order - b.sort_order);
}

function defaultLabelFor(status: BoardColumnInput["status"]): string {
  return BOARD_COLUMNS.find((c) => c.status === status)?.label ?? status;
}

export function BoardColumnsForm({
  projectId,
  overrides,
}: {
  projectId: string;
  overrides: BoardColumnOverride[];
}) {
  const [rows, setRows] = useState<BoardColumnInput[]>(() => initialRows(overrides));
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    const next = rows.slice();
    [next[index], next[target]] = [next[target], next[index]];
    setRows(next.map((row, i) => ({ ...row, sort_order: i })));
    setSaved(false);
  };

  const setLabel = (index: number, label: string) => {
    const next = rows.slice();
    next[index] = { ...next[index], label };
    setRows(next);
    setSaved(false);
  };

  const toggleHidden = (index: number) => {
    const next = rows.slice();
    next[index] = { ...next[index], hidden: !next[index].hidden };
    setRows(next);
    setSaved(false);
  };

  const handleSave = () => {
    setError(null);
    setSaved(false);
    startSaving(async () => {
      const result = await updateBoardColumns(projectId, rows);
      if (result.error) {
        setError(result.error);
      } else {
        setSaved(true);
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Columns3 className="h-5 w-5" />
          Board Columns
        </CardTitle>
        <CardDescription>
          Rename, reorder, or hide columns on this project&apos;s task board. The underlying task
          statuses don&apos;t change - this only affects labels and what&apos;s shown.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((row, index) => (
          <div
            key={row.status}
            className={`flex items-center gap-2 rounded-md border border-border p-2 ${row.hidden ? "opacity-50" : ""}`}
          >
            <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="flex flex-col">
              <button
                type="button"
                disabled={index === 0}
                onClick={() => move(index, -1)}
                className="text-xs leading-none text-muted-foreground hover:text-foreground disabled:opacity-30"
                aria-label={`Move ${row.label} up`}
              >
                ▲
              </button>
              <button
                type="button"
                disabled={index === rows.length - 1}
                onClick={() => move(index, 1)}
                className="text-xs leading-none text-muted-foreground hover:text-foreground disabled:opacity-30"
                aria-label={`Move ${row.label} down`}
              >
                ▼
              </button>
            </div>
            <Input
              value={row.label}
              placeholder={defaultLabelFor(row.status)}
              onChange={(event) => setLabel(index, event.target.value)}
              className="h-8 flex-1"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => toggleHidden(index)}
              title={row.hidden ? "Hidden - click to show" : "Visible - click to hide"}
            >
              {row.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        ))}

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button type="button" onClick={handleSave} disabled={saving}>
            <Check className="h-4 w-4 mr-2" />
            {saving ? "Saving..." : "Save Board Layout"}
          </Button>
          {saved && !saving && <span className="text-sm text-success">Saved.</span>}
        </div>
      </CardContent>
    </Card>
  );
}
