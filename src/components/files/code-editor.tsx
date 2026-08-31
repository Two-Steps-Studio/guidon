"use client";

import { useEffect, useState } from "react";
import Editor, { loader, type Monaco } from "@monaco-editor/react";
import { Loader2 } from "lucide-react";

/**
 * Loaded only via next/dynamic (see code-workspace.tsx), same reasoning as
 * code-block.tsx: Monaco's bundle is multiple MB and must never reach a page
 * that hasn't opened the editor.
 *
 * `loader.config` points the AMD loader at /public/monaco-editor/vs (copied
 * from node_modules by scripts/copy-monaco-assets.mjs) instead of the
 * default jsdelivr CDN - Guidon's self-hosted mode must work fully offline.
 */
loader.config({ paths: { vs: "/monaco-editor/vs" } });

interface CodeEditorProps {
  /**
   * Unique per open tab (its repo path). Without this, every tab shares one
   * underlying Monaco model and switching tabs replaces its content via
   * setValue() - which clears the undo/redo stack and resets scroll/cursor
   * position for the file you're switching back to. Passing a distinct path
   * per file is @monaco-editor/react's documented way to give each tab its
   * own model (created lazily, cached internally, keyed by this string) so
   * switching tabs restores exactly where you left off.
   */
  path: string;
  value: string;
  language: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  /** Fires once, the first time any editor instance mounts - lets the
   * parent (which owns tab lifecycle) dispose a closed tab's model. */
  onMonacoReady?: (monaco: Monaco) => void;
}

export default function CodeEditor({ path, value, language, onChange, readOnly, onMonacoReady }: CodeEditorProps) {
  const [dark, setDark] = useState(false);

  // Match the editor's theme to the page, including live changes - same
  // approach code-block.tsx uses for the read-only Prism preview.
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const explicit = document.documentElement.getAttribute("data-theme");

    const resolve = () => setDark(explicit === "dark" || (explicit !== "light" && query.matches));

    resolve();
    query.addEventListener("change", resolve);
    return () => query.removeEventListener("change", resolve);
  }, []);

  return (
    <Editor
      height="100%"
      path={path}
      language={language}
      value={value}
      theme={dark ? "vs-dark" : "vs"}
      onChange={(next) => onChange(next ?? "")}
      onMount={(_editor, monaco) => onMonacoReady?.(monaco)}
      options={{
        readOnly,
        minimap: { enabled: false },
        fontSize: 13,
        scrollBeyondLastLine: false,
        automaticLayout: true,
      }}
      loading={
        <p className="flex items-center gap-2 p-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading editor...
        </p>
      }
    />
  );
}
