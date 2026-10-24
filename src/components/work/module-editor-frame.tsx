"use client";
import type { ReactNode } from "react";

export type EditorTab = "chat" | "preview" | "inspector";
export function ModuleEditorFrame({ id, tab, onTab, chatWidth, previewWidth, onResize, labels, toolbar, chat, preview, inspector }: {
  id: string; tab: EditorTab; onTab: (tab: EditorTab) => void;
  chatWidth: number; previewWidth: number; onResize: (chat: number, preview: number) => void;
  labels: Record<EditorTab | "chatWidth" | "previewWidth", string>;
  toolbar: ReactNode; chat: ReactNode; preview: ReactNode; inspector: ReactNode;
}) {
  const tabs: EditorTab[] = ["chat", "preview", "inspector"];
  return <div className="min-w-0 space-y-3" data-module-editor>
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-md border bg-card p-3 xl:static" data-editor-toolbar>{toolbar}</div>
    <div role="tablist" className="flex gap-1 rounded-md border p-1 xl:hidden" aria-label="Module editor" onKeyDown={(event) => {
      const index = tabs.indexOf(tab);
      const next = event.key === "ArrowRight" ? (index + 1) % 3 : event.key === "ArrowLeft" ? (index + 2) % 3 : event.key === "Home" ? 0 : event.key === "End" ? 2 : -1;
      if (next < 0) return;
      event.preventDefault(); onTab(tabs[next]);
      event.currentTarget.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
    }}>{tabs.map((item) => <button key={item} type="button" id={`${id}-${item}-tab`} role="tab" aria-selected={tab === item} aria-controls={`${id}-${item}-panel`} tabIndex={tab === item ? 0 : -1} onClick={() => onTab(item)} className={`min-w-0 flex-1 rounded px-2 py-2 text-sm ${tab === item ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{labels[item]}</button>)}</div>
    <div className="hidden flex-wrap gap-4 text-xs xl:flex">
      <label className="flex items-center gap-2">{labels.chatWidth}<input type="range" min={25} max={30} value={chatWidth} onChange={(event) => onResize(Number(event.target.value),previewWidth)} /></label>
      <label className="flex items-center gap-2">{labels.previewWidth}<input type="range" min={50} max={55} value={previewWidth} onChange={(event) => onResize(chatWidth,Number(event.target.value))} /></label>
    </div>
    <div className="min-w-0 gap-3 xl:grid" style={{ gridTemplateColumns: `minmax(0,${chatWidth}fr) minmax(0,${previewWidth}fr) minmax(0,${100-chatWidth-previewWidth}fr)` }} data-editor-columns>
      {tabs.map((item) => <section key={item} id={`${id}-${item}-panel`} role="tabpanel" aria-labelledby={`${id}-${item}-tab`} tabIndex={0} className={`min-w-0 space-y-3 overflow-x-auto rounded-lg border bg-background p-3 ${tab === item ? "block" : "hidden"} xl:block`}><h3 className="text-sm font-semibold">{labels[item]}</h3>{{ chat, preview, inspector }[item]}</section>)}
    </div>
  </div>;
}
