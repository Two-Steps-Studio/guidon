"use client";

import type { KeyboardEvent, RefObject } from "react";
import { useTranslations } from "next-intl";
import { Bold, Code, Heading2, Italic, Link2, List, ListChecks, ListOrdered } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  continueList,
  insertLink,
  toggleInline,
  toggleLinePrefix,
  type EditResult,
  type LinePrefixKind,
} from "@/lib/work/markdown-edit";

type Action =
  | { kind: "inline"; before: string; after: string; placeholder: string }
  | { kind: "prefix"; prefix: LinePrefixKind }
  | { kind: "link" };

interface ToolbarItem {
  key: string;
  labelKey:
    | "formatBold"
    | "formatItalic"
    | "formatHeading"
    | "formatBulletList"
    | "formatNumberedList"
    | "formatTaskList"
    | "formatCode"
    | "formatLink";
  icon: typeof Bold;
  action: Action;
}

const ITEMS: ToolbarItem[] = [
  { key: "bold", labelKey: "formatBold", icon: Bold, action: { kind: "inline", before: "**", after: "**", placeholder: "bold" } },
  { key: "italic", labelKey: "formatItalic", icon: Italic, action: { kind: "inline", before: "_", after: "_", placeholder: "italic" } },
  { key: "heading", labelKey: "formatHeading", icon: Heading2, action: { kind: "prefix", prefix: "heading" } },
  { key: "bullet", labelKey: "formatBulletList", icon: List, action: { kind: "prefix", prefix: "bullet" } },
  { key: "numbered", labelKey: "formatNumberedList", icon: ListOrdered, action: { kind: "prefix", prefix: "numbered" } },
  { key: "task", labelKey: "formatTaskList", icon: ListChecks, action: { kind: "prefix", prefix: "task" } },
  { key: "code", labelKey: "formatCode", icon: Code, action: { kind: "inline", before: "`", after: "`", placeholder: "code" } },
  { key: "link", labelKey: "formatLink", icon: Link2, action: { kind: "link" } },
];

function run(action: Action, value: string, start: number, end: number): EditResult {
  switch (action.kind) {
    case "inline":
      return toggleInline(value, start, end, action.before, action.after, action.placeholder);
    case "prefix":
      return toggleLinePrefix(value, start, end, action.prefix);
    case "link":
      return insertLink(value, start, end);
  }
}

/**
 * Keydown handler for the description textarea: Enter continues a list
 * (bullet, number, task) or ends it on an empty item; Ctrl/Cmd+B and +I
 * wrap the selection. Everything else is left to the browser.
 */
export function descriptionKeyDown(
  event: KeyboardEvent<HTMLTextAreaElement>,
  apply: (result: EditResult) => void
): void {
  const el = event.currentTarget;

  if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
    if (el.selectionStart !== el.selectionEnd) return;
    const result = continueList(el.value, el.selectionStart);
    if (result) {
      event.preventDefault();
      apply(result);
    }
    return;
  }

  if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey) {
    const key = event.key.toLowerCase();
    if (key === "b" || key === "i") {
      event.preventDefault();
      const item = ITEMS.find((candidate) => candidate.key === (key === "b" ? "bold" : "italic"));
      if (item) apply(run(item.action, el.value, el.selectionStart, el.selectionEnd));
    }
  }
}

export function DescriptionToolbar({
  textareaRef,
  disabled,
  apply,
}: {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  disabled?: boolean;
  /** Receives the next value + selection; the owner sets state and restores the caret. */
  apply: (result: EditResult) => void;
}) {
  const t = useTranslations("work");

  return (
    <div role="toolbar" aria-label={t("formatToolbar")} className="flex flex-wrap items-center gap-0.5">
      {ITEMS.map((item) => (
        <Button
          key={item.key}
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          disabled={disabled}
          title={t(item.labelKey)}
          aria-label={t(item.labelKey)}
          // Keep the textarea's selection: a button mousedown would otherwise blur it first.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            const el = textareaRef.current;
            if (!el) return;
            apply(run(item.action, el.value, el.selectionStart, el.selectionEnd));
          }}
        >
          <item.icon className="h-3.5 w-3.5" aria-hidden />
        </Button>
      ))}
    </div>
  );
}
