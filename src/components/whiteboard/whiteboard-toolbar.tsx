"use client";

import { useTranslations } from "next-intl";
import { Circle, ClipboardList, Plus, Sparkles, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Node } from "reactflow";

interface WhiteboardToolbarProps {
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
 * także w trybie przewijania czy zaznaczania.
 */
export function WhiteboardToolbar({
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
      className="absolute bottom-6 left-1/2 z-50 -translate-x-1/2 flex max-w-[95%] flex-wrap items-center justify-center gap-2 rounded-full border border-border bg-background/80 p-2 shadow-lg backdrop-blur-md"
    >
      <Button variant="ghost" size="sm" onClick={onAddSticky} className="gap-2">
        <Plus size={16} />
        <span>{t("addSticky")}</span>
      </Button>
      <Button variant="ghost" size="sm" onClick={onAddRectangle} className="gap-2" title={t("addRectangle")}>
        <Square size={14} />
        <span>{t("addRectangle")}</span>
      </Button>
      <Button variant="ghost" size="sm" onClick={onAddCircle} className="gap-2" title={t("addCircle")}>
        <Circle />
        <span>{t("addCircle")}</span>
      </Button>

      <div className="mx-1 h-4 w-px bg-border" />

      <Button
        variant={tasksVisible ? "secondary" : "ghost"}
        size="sm"
        onClick={onToggleTasks}
        className="gap-2"
      >
        <ClipboardList size={16} />
        <span>{tasksVisible ? t("hideTasks") : t("showTasks")}</span>
      </Button>

      <div className="mx-1 h-4 w-px bg-border" />

      <Button
        variant="ghost"
        size="sm"
        onClick={onAIConvert}
        disabled={selectedColors === 0}
        className="gap-2 text-primary disabled:opacity-50"
      >
        <Sparkles size={16} />
        <span>{t("convertToTasks")}</span>
      </Button>

      {singleSticky && (
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

      {selectedNodes.length > 0 && (
        <>
          <div className="mx-1 h-4 w-px bg-border" />
          <Button variant="ghost" size="sm" onClick={onDeleteSelected} className="gap-2 text-destructive">
            <Trash2 size={16} />
            <span>{t("deleteSelected")}</span>
          </Button>
        </>
      )}
    </div>
  );
}
