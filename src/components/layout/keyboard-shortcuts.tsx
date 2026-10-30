"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Fired to open the command palette from elsewhere (command-palette.tsx listens). */
export const OPEN_COMMAND_PALETTE_EVENT = "guidon:open-command-palette";

/** True while the user types into a field - single-key shortcuts must not fire then. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * The form Ctrl/Cmd+S saves: the one being edited, else the one marked
 * `data-save-shortcut` in the topmost open dialog, else on the page.
 */
function formToSave(): HTMLFormElement | null {
  const focused = document.activeElement?.closest("form");
  if (focused) return focused;
  const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"]');
  const scope: ParentNode = dialogs.length ? dialogs[dialogs.length - 1] : document;
  return scope.querySelector<HTMLFormElement>("form[data-save-shortcut]");
}

function submitButtonDisabled(form: HTMLFormElement): boolean {
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"], button:not([type])');
  return !!submit?.disabled;
}

const SHORTCUTS: { keys: string[]; labelKey: "save" | "search" | "searchSlash" | "sidebar" | "newTask" | "select" | "reorder" | "close" | "help" }[] = [
  { keys: ["Ctrl", "S"], labelKey: "save" },
  { keys: ["Ctrl", "K"], labelKey: "search" },
  { keys: ["/"], labelKey: "searchSlash" },
  { keys: ["Ctrl", "B"], labelKey: "sidebar" },
  { keys: ["N"], labelKey: "newTask" },
  { keys: ["Ctrl", "Click"], labelKey: "select" },
  { keys: ["Alt", "↑ ↓"], labelKey: "reorder" },
  { keys: ["Esc"], labelKey: "close" },
  { keys: ["?"], labelKey: "help" },
];

/**
 * App-wide keyboard shortcuts (mounted once in AppShell):
 * - Ctrl/Cmd+S saves the form being edited instead of the browser's "Save
 *   page". A component that saves something else (the code editor) handles
 *   the key itself and calls preventDefault(); this then stays out of it.
 * - "/" opens search, "?" lists every shortcut.
 */
export function KeyboardShortcuts() {
  const t = useTranslations("shortcuts");
  const [helpOpen, setHelpOpen] = useState(false);
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;

      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        const form = formToSave();
        if (form && !submitButtonDisabled(form)) form.requestSubmit();
        return;
      }

      if (event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return;
      if (event.key === "?") {
        event.preventDefault();
        setHelpOpen((open) => !open);
      } else if (event.key === "/") {
        event.preventDefault();
        window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
      <DialogContent motion="none" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <dl className="divide-y divide-border text-sm">
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.labelKey} className="flex items-center justify-between gap-4 py-2">
              <dt className="text-muted-foreground">{t(shortcut.labelKey)}</dt>
              <dd className="flex shrink-0 gap-1">
                {shortcut.keys.map((key) => (
                  <kbd key={key} className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">
                    {key === "Ctrl" && isMac ? "⌘" : key}
                  </kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
