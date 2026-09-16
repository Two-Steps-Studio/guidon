"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import c from "react-syntax-highlighter/dist/esm/languages/prism/c";
import cpp from "react-syntax-highlighter/dist/esm/languages/prism/cpp";
import csharp from "react-syntax-highlighter/dist/esm/languages/prism/csharp";
import css from "react-syntax-highlighter/dist/esm/languages/prism/css";
import docker from "react-syntax-highlighter/dist/esm/languages/prism/docker";
import glsl from "react-syntax-highlighter/dist/esm/languages/prism/glsl";
import go from "react-syntax-highlighter/dist/esm/languages/prism/go";
import hlsl from "react-syntax-highlighter/dist/esm/languages/prism/hlsl";
import java from "react-syntax-highlighter/dist/esm/languages/prism/java";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import jsx from "react-syntax-highlighter/dist/esm/languages/prism/jsx";
import kotlin from "react-syntax-highlighter/dist/esm/languages/prism/kotlin";
import lua from "react-syntax-highlighter/dist/esm/languages/prism/lua";
import markup from "react-syntax-highlighter/dist/esm/languages/prism/markup";
import php from "react-syntax-highlighter/dist/esm/languages/prism/php";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import ruby from "react-syntax-highlighter/dist/esm/languages/prism/ruby";
import rust from "react-syntax-highlighter/dist/esm/languages/prism/rust";
import scss from "react-syntax-highlighter/dist/esm/languages/prism/scss";
import sql from "react-syntax-highlighter/dist/esm/languages/prism/sql";
import swift from "react-syntax-highlighter/dist/esm/languages/prism/swift";
import toml from "react-syntax-highlighter/dist/esm/languages/prism/toml";
import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import yaml from "react-syntax-highlighter/dist/esm/languages/prism/yaml";

/**
 * Loaded only via next/dynamic from file-viewer.tsx, so this bundle never
 * reaches pages that do not open a code file.
 *
 * PrismLight (not the plain `Prism` import), registered with exactly the
 * languages src/types/file.ts's prismLanguage() can ever produce - the full
 * `Prism` build bundles every language Prism ships (~290), which measured
 * ~640KB minified in this app's own build output for a feature that only
 * ever needs the ~30 extensions EXTENSIONS.code lists. html/xml aren't their
 * own Prism grammar - both are aliases for `markup`, so registered
 * separately under those two names pointing at the same import.
 *
 * "gradle" is deliberately not registered: the installed
 * react-syntax-highlighter@15's gradle module imports "refractor/lang/
 * gradle.js", which doesn't exist in the installed refractor@3.6.0 (only
 * hlsl.js/toml.js of that trio are present) - a broken dependency pairing,
 * not something introduced here. A .gradle file falls back to CodeBlock's
 * unhighlighted-but-functional rendering (react-syntax-highlighter warns
 * and renders plain text for an unregistered language) rather than this
 * whole feature failing to build.
 */
SyntaxHighlighter.registerLanguage("bash", bash);
SyntaxHighlighter.registerLanguage("c", c);
SyntaxHighlighter.registerLanguage("cpp", cpp);
SyntaxHighlighter.registerLanguage("csharp", csharp);
SyntaxHighlighter.registerLanguage("css", css);
SyntaxHighlighter.registerLanguage("docker", docker);
SyntaxHighlighter.registerLanguage("glsl", glsl);
SyntaxHighlighter.registerLanguage("go", go);
SyntaxHighlighter.registerLanguage("hlsl", hlsl);
SyntaxHighlighter.registerLanguage("java", java);
SyntaxHighlighter.registerLanguage("javascript", javascript);
SyntaxHighlighter.registerLanguage("json", json);
SyntaxHighlighter.registerLanguage("jsx", jsx);
SyntaxHighlighter.registerLanguage("kotlin", kotlin);
SyntaxHighlighter.registerLanguage("lua", lua);
SyntaxHighlighter.registerLanguage("html", markup);
SyntaxHighlighter.registerLanguage("xml", markup);
SyntaxHighlighter.registerLanguage("php", php);
SyntaxHighlighter.registerLanguage("python", python);
SyntaxHighlighter.registerLanguage("ruby", ruby);
SyntaxHighlighter.registerLanguage("rust", rust);
SyntaxHighlighter.registerLanguage("scss", scss);
SyntaxHighlighter.registerLanguage("sql", sql);
SyntaxHighlighter.registerLanguage("swift", swift);
SyntaxHighlighter.registerLanguage("toml", toml);
SyntaxHighlighter.registerLanguage("tsx", tsx);
SyntaxHighlighter.registerLanguage("typescript", typescript);
SyntaxHighlighter.registerLanguage("yaml", yaml);
interface CodeBlockProps {
  /** Signed URL to fetch the file contents from. */
  url: string;
  language: string;
  /** Plain text - skip highlighting, keep the monospace layout. */
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

  // Match the viewer's theme to the page, including live changes - both the
  // OS-level scheme (matchMedia) and the app's own theme toggle, which sets
  // data-theme on <html> with no OS-level change involved. Reading
  // data-theme only once, outside resolve(), meant switching the app's
  // theme while a code file was already open left the syntax highlighter's
  // theme (oneDark/oneLight) stale relative to the rest of the repainted UI.
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const root = document.documentElement;

    const resolve = () => {
      const explicit = root.getAttribute("data-theme");
      setDark(explicit === "dark" || (explicit !== "light" && query.matches));
    };

    resolve();
    query.addEventListener("change", resolve);
    const observer = new MutationObserver(resolve);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });

    return () => {
      query.removeEventListener("change", resolve);
      observer.disconnect();
    };
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
