"use client";

import { useEffect, useState } from "react";
import Editor, { loader, type Monaco } from "@monaco-editor/react";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffectiveTheme } from "@/lib/use-effective-theme";

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
  // Follows the app's theme switcher live, not just the OS setting.
  const dark = useEffectiveTheme() === "dark";
  const [failed, setFailed] = useState(false);

  // <Editor> only logs a failed load and keeps showing its spinner forever -
  // e.g. when /monaco-editor/vs is missing from a build. Watch the same
  // (shared, load-once) init promise so the user gets told instead.
  useEffect(() => {
    const init = loader.init();
    init.catch((error: { type?: string }) => {
      if (error?.type !== "cancelation") setFailed(true);
    });
    return () => init.cancel();
  }, []);

  if (failed) {
    return (
      <div role="alert" className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-sm">
        <p className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-4 w-4" />
          The code editor could not be loaded.
        </p>
        <p className="max-w-md text-muted-foreground">
          Check your connection and reload. On a self-hosted server, the editor files under /monaco-editor are
          missing - rebuild the app (npm run build copies them).
        </p>
        <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </div>
    );
  }

  return (
    <Editor
      height="100%"
      path={path}
      language={language}
      value={value}
      theme={dark ? "vs-dark" : "vs"}
      onChange={(next) => onChange(next ?? "")}
      onMount={(_editor, monaco) => onMonacoReady?.(monaco)}
      // Unmounting (switching to an image, a Markdown preview or a tab
      // still loading) would otherwise dispose this tab's model and lose its
      // undo history and cursor. code-workspace.tsx disposes models itself
      // once their tab is closed.
      keepCurrentModel
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
