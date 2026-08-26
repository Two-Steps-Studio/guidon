"use client";

import { useEffect, useState } from "react";
import Editor, { loader } from "@monaco-editor/react";
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
  value: string;
  language: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

export default function CodeEditor({ value, language, onChange, readOnly }: CodeEditorProps) {
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
      language={language}
      value={value}
      theme={dark ? "vs-dark" : "vs"}
      onChange={(next) => onChange(next ?? "")}
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
