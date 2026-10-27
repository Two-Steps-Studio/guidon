"use client";

import { confirmAction } from "@/components/ui/confirm-action";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRightLeft, Loader2, Tag, Trash2, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { TaskCardMember } from "@/components/work/task-card";
import type { BoardColumn } from "@/lib/work/task-board";
import type { Task } from "@/types/task";
import type { BulkOperation } from "./bulk-actions";

/**
 * Floating bar shown while cards are selected on the board (Ctrl/Cmd/Shift-
 * click): move, assign, label or delete them in one go. Labels offer every
 * label already used on the board; one that every selected card already has
 * is removed instead of added.
 */
export function BulkBar({
  selected,
  columns,
  members,
  labels,
  canDelete,
  onRun,
  onClear,
}: {
  selected: Task[];
  columns: readonly BoardColumn[];
  members: TaskCardMember[];
  labels: string[];
  canDelete: boolean;
  onRun: (operation: BulkOperation) => Promise<void>;
  onClear: () => void;
}) {
  const t = useTranslations("work");
  const [pending, setPending] = useState(false);

  const run = async (operation: BulkOperation) => {
    setPending(true);
    try {
      await onRun(operation);
    } finally {
      setPending(false);
    }
  };

  const everyHas = (label: string) => selected.every((task) => (task.tags ?? []).includes(label));

  return (
    <div
      role="toolbar"
      aria-label={t("bulkToolbar")}
      className="fixed inset-x-0 bottom-4 z-40 mx-auto flex w-fit max-w-[calc(100vw-2rem)] flex-wrap items-center gap-1 rounded-xl border border-border bg-popover px-2 py-1.5 shadow-lg"
    >
      <span className="px-2 text-sm font-medium tabular-nums">{t("bulkSelected", { count: selected.length })}</span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" disabled={pending}>
            <ArrowRightLeft className="h-4 w-4" />
            {t("bulkMove")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" side="top">
          {columns.map((column) => (
            <DropdownMenuItem key={column.status} onSelect={() => run({ kind: "move", status: column.status })}>
              {column.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" disabled={pending}>
            <UserRound className="h-4 w-4" />
            {t("bulkAssign")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" side="top">
          {members.map((member) => (
            <DropdownMenuItem key={member.id} onSelect={() => run({ kind: "assign", assigneeId: member.id })}>
              {member.full_name || member.email}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => run({ kind: "assign", assigneeId: null })}>{t("unassigned")}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {labels.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" disabled={pending}>
              <Tag className="h-4 w-4" />
              {t("bulkLabel")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" side="top">
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{t("bulkLabelHint")}</DropdownMenuLabel>
            {labels.map((label) => {
              const remove = everyHas(label);
              return (
                <DropdownMenuItem key={label} onSelect={() => run({ kind: "label", label, add: !remove })}>
                  <span className="w-3 text-muted-foreground">{remove ? "−" : "+"}</span>
                  {label}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {canDelete && (
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          className="text-destructive hover:text-destructive"
          onClick={async () => {
            if (await confirmAction(t("bulkDeleteConfirm", { count: selected.length }))) run({ kind: "delete" });
          }}
        >
          <Trash2 className="h-4 w-4" />
          {t("bulkDelete")}
        </Button>
      )}

      {pending && <Loader2 className="mx-1 h-4 w-4 animate-spin text-muted-foreground" aria-hidden />}

      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClear} aria-label={t("bulkClear")}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
