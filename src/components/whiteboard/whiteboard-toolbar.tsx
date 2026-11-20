"use client";

import { useTranslations } from "next-intl";
import { Circle, ClipboardList, Plus, Sparkles, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Node } from "reactflow";

interface WhiteboardToolbarProps {
  /** Viewers and testers only look at the board (RLS 107). */
  canEdit: boolean;
  /** AI on for the project and not hidden by the person. */
  ai: boolean;
  onAddSticky: () => void;
  onAddRectangle: () => void;
  onAddCircle: () => void;
  tasksVisible: boolean;
  onToggleTasks: () => void;
  selectedNodes: Node[];
  onDeleteSelected: () => void;
  onColorChange: (color: string) => void;
  colors: string[];
  onAIConvert: () => void;
}

/**
 * Pasek narzędzi tablicy - elementy tworzy kanwa na środku widoku (toolbar
 * tylko prosi), a podwójny klik na tle tworzy karteczkę pod kursorem,
 * także w trybie przewijania czy zaznaczania. Na telefonie same ikony
 * (podpisy dla czytników ekranu) z polami dotyku 44px, żeby pasek nie
 * zasłaniał płótna.
 */
export function WhiteboardToolbar({
  canEdit,
  ai,
  onAddSticky,
  onAddRectangle,
  onAddCircle,
  tasksVisible,
  onToggleTasks,
  selectedNodes,
  onDeleteSelected,
  onColorChange,
  colors,
  onAIConvert,
}: WhiteboardToolbarProps) {
  const t = useTranslations("whiteboard");

  const singleSticky = selectedNodes.length === 1 && selectedNodes[0].type === "sticky";
  const selectedColors = selectedNodes.filter((node) => node.type === "sticky").length;

  return (
    <div
      data-tour-toolbar
      className="absolute inset-x-0 bottom-6 z-50 mx-auto max-sm:bottom-24 flex w-fit max-w-[95%] flex-wrap items-center justify-center gap-2 rounded-full border border-border bg-background/80 p-2 shadow-lg backdrop-blur-md"
    >
      {canEdit && (
        <>
          <Button variant="ghost" size="sm" onClick={onAddSticky} className="gap-2 max-sm:size-11 max-sm:px-0">
            <Plus size={16} />
            <span className="max-sm:sr-only">{t("addSticky")}</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={onAddRectangle} className="gap-2 max-sm:size-11 max-sm:px-0" title={t("addRectangle")}>
            <Square size={14} />
            <span className="max-sm:sr-only">{t("addRectangle")}</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={onAddCircle} className="gap-2 max-sm:size-11 max-sm:px-0" title={t("addCircle")}>
            <Circle />
            <span className="max-sm:sr-only">{t("addCircle")}</span>
          </Button>

          <div className="mx-1 h-4 w-px bg-border" />
        </>
      )}

      <Button
        variant={tasksVisible ? "secondary" : "ghost"}
        size="sm"
        onClick={onToggleTasks}
        className="gap-2 max-sm:size-11 max-sm:px-0"
      >
        <ClipboardList size={16} />
        <span className="max-sm:sr-only">{tasksVisible ? t("hideTasks") : t("showTasks")}</span>
      </Button>

      {ai && (
        <>
          <div className="mx-1 h-4 w-px bg-border" />
          <Button
            variant="ghost"
            size="sm"
            onClick={onAIConvert}
            disabled={selectedColors === 0}
            className="gap-2 max-sm:size-11 max-sm:px-0 text-primary disabled:opacity-50"
          >
            <Sparkles size={16} />
            <span className="max-sm:sr-only">{t("convertToTasks")}</span>
          </Button>
        </>
      )}

      {canEdit && singleSticky && (
        <>
          <div className="mx-1 h-4 w-px bg-border" />
          <div className="flex items-center gap-1" role="group" aria-label={t("colorLabel")}>
            {colors.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => onColorChange(color)}
                aria-label={`${t("colorLabel")}: ${color}`}
                className="size-5 rounded-full border border-border transition-transform hover:scale-110"
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </>
      )}

      {canEdit && selectedNodes.length > 0 && (
        <>
          <div className="mx-1 h-4 w-px bg-border" />
          <Button variant="ghost" size="sm" onClick={onDeleteSelected} className="gap-2 max-sm:size-11 max-sm:px-0 text-destructive">
            <Trash2 size={16} />
            <span className="max-sm:sr-only">{t("deleteSelected")}</span>
          </Button>
        </>
      )}
    </div>
  );
}
