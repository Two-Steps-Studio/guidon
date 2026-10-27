"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ModuleManifest } from "@/lib/work/module-manifest";
import type { ModuleRecord } from "@/lib/work/module-records";
import { parseUiTree, sandboxChangeSchema, SANDBOX_FRAME_HTML, SANDBOX_LIMITS, WORKER_EPILOGUE, WORKER_PRELUDE, type SandboxChange, type UiNode } from "@/lib/work/module-sandbox";

type Log = { level: "log" | "warn" | "error"; text: string };
type Pending = { resolve: (value: { tree?: unknown; change?: unknown }) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };

/**
 * Runs a module's script (engine 1.3) in the sandbox described in
 * src/lib/work/module-sandbox.ts and draws the UI it returns. A request that
 * isn't answered within the time limit restarts the sandbox (an endless
 * loop only ever stalls its own worker). `onChange` saves a change the
 * script asked for - the caller validates and persists it; without it
 * (preview, read-only roles) changes are only reported.
 */
export function ModuleSandboxView({ manifest, source, records, canWrite, onChange, onLog }: {
  manifest: ModuleManifest; source: string; records: ModuleRecord[]; canWrite: boolean;
  onChange?: (change: SandboxChange) => Promise<string | null>;
  onLog?: (log: Log) => void;
}) {
  const t = useTranslations("moduleSandbox");
  const frame = useRef<HTMLIFrameElement>(null);
  const pending = useRef(new Map<number, Pending>());
  const sequence = useRef(0);
  const ready = useRef<{ promise: Promise<void>; resolve: () => void; reject: (error: Error) => void } | null>(null);
  const [generation, setGeneration] = useState(0);
  const [tree, setTree] = useState<UiNode | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Kept after the automatic restart (whose render clears `error`) so the person learns why.
  const [stopped, setStopped] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string | boolean>>({});
  const [busy, setBusy] = useState(false);
  const formRef = useRef(form);
  useEffect(() => { formRef.current = form; }, [form]);

  const restart = useCallback(() => {
    for (const entry of pending.current.values()) { clearTimeout(entry.timer); entry.reject(new Error(t("stopped"))); }
    pending.current.clear();
    ready.current = null;
    setGeneration((value) => value + 1);
  }, [t]);

  const request = useCallback(async (message: { type: "render" } | { type: "action"; action: string; payload: unknown }) => {
    if (!ready.current) throw new Error(t("notReady"));
    await ready.current.promise;
    const target = frame.current?.contentWindow;
    if (!target) throw new Error(t("notReady"));
    const id = ++sequence.current;
    return new Promise<{ tree?: unknown; change?: unknown }>((resolve, reject) => {
      const timer = setTimeout(() => {
        const message = t("timeout", { seconds: SANDBOX_LIMITS.timeoutMs / 1000 });
        pending.current.delete(id); setStopped(message); reject(new Error(message)); restart();
      }, SANDBOX_LIMITS.timeoutMs);
      pending.current.set(id, { resolve, reject, timer });
      // Records and entity schemas only - no user, project or session data.
      target.postMessage({ ...message, id, records, entities: manifest.entities, form: formRef.current, canWrite }, "*");
    });
  }, [canWrite, manifest.entities, records, restart, t]);

  // State is set only in the promise callbacks, never synchronously (it also runs from an effect).
  const render = useCallback(() => request({ type: "render" }).then(
    (answer) => { setTree(parseUiTree(answer.tree)); setError(null); },
  ).catch((failure) => { setError(failure instanceof Error ? failure.message : String(failure)); }), [request]);

  // One sandbox per generation: a restart replaces the iframe (and its worker) entirely.
  useEffect(() => {
    let resolve!: () => void; let reject!: (error: Error) => void;
    const promise = new Promise<void>((ok, fail) => { resolve = ok; reject = fail; });
    promise.catch(() => {});
    ready.current = { promise, resolve, reject };
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || !event.data || event.data.channel !== "guidon-sandbox") return;
      const message = event.data as { type: string; id?: number; tree?: unknown; change?: unknown; message?: string; level?: Log["level"]; text?: string };
      if (message.type === "frame") frame.current?.contentWindow?.postMessage({ type: "init", source, prelude: WORKER_PRELUDE, epilogue: WORKER_EPILOGUE }, "*");
      else if (message.type === "ready") resolve();
      else if (message.type === "log" && typeof message.text === "string") onLog?.({ level: message.level === "warn" || message.level === "error" ? message.level : "log", text: message.text });
      else if (message.type === "error" && message.id === -1) { reject(new Error(message.message ?? "Script error")); setError(message.message ?? "Script error"); }
      else if (typeof message.id === "number") {
        const entry = pending.current.get(message.id);
        if (!entry) return;
        clearTimeout(entry.timer); pending.current.delete(message.id);
        if (message.type === "result") entry.resolve({ tree: message.tree, change: message.change });
        else entry.reject(new Error(message.message ?? "Script error"));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [generation, source, onLog]);

  useEffect(() => { void render(); }, [render, generation]);

  async function act(action: string, payload: unknown) {
    setBusy(true);
    try {
      const answer = await request({ type: "action", action, payload });
      if (answer.change) {
        const change = sandboxChangeSchema.parse(answer.change);
        if (!canWrite || !onChange) setError(t("readOnlyChange"));
        else { const failure = await onChange(change); setError(failure); }
      }
      await render();
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setBusy(false); }
  }

  const draw = (current: UiNode, key: string): ReactNode => {
    switch (current.type) {
      case "stack": return <div key={key} className="min-w-0 space-y-3">{current.children.map((child, index) => draw(child, `${key}.${index}`))}</div>;
      case "row": return <div key={key} className="flex min-w-0 flex-wrap items-center gap-2">{current.children.map((child, index) => draw(child, `${key}.${index}`))}</div>;
      case "list": return <ul key={key} className="min-w-0 list-inside list-disc space-y-1 text-sm">{current.children.map((child, index) => <li key={index} className="break-words">{draw(child, `${key}.${index}`)}</li>)}</ul>;
      case "heading": return <h3 key={key} className="break-words font-semibold">{current.text}</h3>;
      case "badge": return <span key={key} className="rounded bg-muted px-2 py-0.5 text-xs">{current.text}</span>;
      case "text": return <p key={key} className={`whitespace-pre-wrap break-words text-sm ${current.tone === "muted" ? "text-muted-foreground" : current.tone === "danger" ? "text-destructive" : current.tone === "success" ? "text-success" : ""}`}>{current.text}</p>;
      case "button": return <Button key={key} size="sm" variant={current.variant === "outline" ? "outline" : current.variant === "danger" ? "destructive" : "default"} disabled={busy} onClick={() => { setStopped(null); void act(current.action, current.payload ?? null); }}>{current.label}</Button>;
      case "input": {
        const id = `sandbox-${current.name}`;
        const value = form[current.name];
        return <label key={key} htmlFor={id} className="block min-w-0 space-y-1 text-sm"><span>{current.label}</span><Input id={id} type={current.kind === "number" ? "number" : current.kind === "date" ? "date" : "text"} value={typeof value === "string" ? value : current.value ?? ""} maxLength={SANDBOX_LIMITS.text} onChange={(event) => setForm((previous) => ({ ...previous, [current.name]: event.target.value }))} /></label>;
      }
      case "checkbox": {
        const value = form[current.name];
        return <label key={key} className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5" checked={typeof value === "boolean" ? value : Boolean(current.checked)} onChange={(event) => setForm((previous) => ({ ...previous, [current.name]: event.target.checked }))} /><span className="break-words">{current.label}</span></label>;
      }
      case "table": return <div key={key} className="max-w-full overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{current.columns.map((column, index) => <th key={index} scope="col" className="border-b p-2">{column}</th>)}</tr></thead><tbody>{current.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, index) => <td key={index} className="max-w-80 whitespace-pre-wrap break-words border-b p-2">{cell}</td>)}</tr>)}</tbody></table></div>;
      case "progress": return <div key={key} className="space-y-1 text-sm">{current.label && <p>{current.label}</p>}<progress className="w-full" value={Math.min(Math.max(current.value, 0), current.max)} max={current.max} /></div>;
    }
  };

  return <div className="min-w-0 space-y-3" data-module-sandbox>
    {/* The sandbox shows nothing itself: no allow-same-origin, so it gets an opaque origin. */}
    <iframe key={generation} ref={frame} title={t("frameTitle")} sandbox="allow-scripts" srcDoc={SANDBOX_FRAME_HTML} className="hidden" aria-hidden="true" tabIndex={-1} />
    {tree && draw(tree, "root")}
    {!tree && !error && <p className="text-sm text-muted-foreground">{t("loading")}</p>}
    {(error || stopped) && <div role="alert" className="space-y-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"><p className="break-words">{error ?? stopped}</p><Button size="sm" variant="outline" onClick={() => { setStopped(null); restart(); }}>{t("restart")}</Button></div>}
  </div>;
}
