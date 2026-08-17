"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";

/**
 * Loaded only via next/dynamic from file-viewer.tsx, so the Prism bundle never
 * reaches pages that do not open a code file.
 */
interface CodeBlockProps {
  /** Signed URL to fetch the file contents from. */
  url: string;
  language: string;
  /** Plain text — skip highlighting, keep the monospace layout. */
  plain?: boolean;
}

export default function CodeBlock({ url, language, plain }: CodeBlockProps) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Could not read the file (${response.status})`);
        }
        const text = await response.text();
        if (!cancelled) setContent(text);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not read file");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url]);

  // Match the viewer's theme to the page, including live changes.
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const explicit = document.documentElement.getAttribute("data-theme");

    const resolve = () =>
      setDark(
        explicit === "dark" || (explicit !== "light" && query.matches)
      );

    resolve();
    query.addEventListener("change", resolve);
    return () => query.removeEventListener("change", resolve);
  }, []);

  if (error) {
    return (
      <div
        role="alert"
        className="flex items-center justify-center gap-2 p-16 text-sm text-destructive"
      >
        <AlertCircle className="h-4 w-4" />
        {error}
      </div>
    );
  }

  if (content === null) {
    return (
      <p className="flex items-center justify-center gap-2 p-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading preview...
      </p>
    );
  }

  if (content.trim() === "") {
    return (
      <p className="p-16 text-center text-sm text-muted-foreground">
        This file is empty.
      </p>
    );
  }

  if (plain) {
    return (
      <pre className="overflow-auto p-4 font-mono text-xs leading-relaxed text-foreground">
        {content}
      </pre>
    );
  }

  return (
    <SyntaxHighlighter
      language={language}
      style={dark ? oneDark : oneLight}
      showLineNumbers
      wrapLongLines={false}
      customStyle={{
        margin: 0,
        background: "transparent",
        fontSize: "0.75rem",
        padding: "1rem",
      }}
      codeTagProps={{ style: { fontFamily: "var(--font-mono)" } }}
    >
      {content}
    </SyntaxHighlighter>
  );
}
