"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  Braces,
  ChevronRight,
  File,
  FileCode,
  FileText,
  Folder,
  Image as ImageIcon,
  Loader2,
  Palette,
  type LucideIcon,
} from "lucide-react";
import { listRepoDirectory } from "@/app/projects/[id]/files/github-actions";
import { fileExtension } from "@/types/file";
import type { GithubTreeEntry } from "@/lib/github/client";

const EXTENSION_ICONS: Record<string, { icon: LucideIcon; colorClass: string }> = {
  ts: { icon: FileCode, colorClass: "text-info" },
  tsx: { icon: FileCode, colorClass: "text-info" },
  js: { icon: FileCode, colorClass: "text-warning" },
  jsx: { icon: FileCode, colorClass: "text-warning" },
  json: { icon: Braces, colorClass: "text-warning" },
  md: { icon: FileText, colorClass: "text-muted-foreground" },
  mdx: { icon: FileText, colorClass: "text-muted-foreground" },
  css: { icon: Palette, colorClass: "text-primary" },
  scss: { icon: Palette, colorClass: "text-primary" },
  html: { icon: FileCode, colorClass: "text-danger" },
  png: { icon: ImageIcon, colorClass: "text-success" },
  jpg: { icon: ImageIcon, colorClass: "text-success" },
  jpeg: { icon: ImageIcon, colorClass: "text-success" },
  gif: { icon: ImageIcon, colorClass: "text-success" },
  svg: { icon: ImageIcon, colorClass: "text-success" },
  webp: { icon: ImageIcon, colorClass: "text-success" },
};

/** File-type icon for the tree/tab bar - a handful of recognizable buckets, not exhaustive. */
export function fileIconFor(name: string): { icon: LucideIcon; colorClass: string } {
  return EXTENSION_ICONS[fileExtension(name)] ?? { icon: File, colorClass: "text-muted-foreground" };
}

interface GithubFileTreeProps {
  projectId: string;
  activePath: string | null;
  onOpenFile: (path: string) => void;
}

export function GithubFileTree({ projectId, activePath, onOpenFile }: GithubFileTreeProps) {
  return (
    <div className="h-full overflow-y-auto py-1">
      <DirectoryLevel projectId={projectId} path="" depth={0} activePath={activePath} onOpenFile={onOpenFile} />
    </div>
  );
}

function DirectoryLevel({
  projectId,
  path,
  depth,
  activePath,
  onOpenFile,
}: {
  projectId: string;
  path: string;
  depth: number;
  activePath: string | null;
  onOpenFile: (path: string) => void;
}) {
  const [entries, setEntries] = useState<GithubTreeEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const result = await listRepoDirectory(projectId, path);
      if (cancelled) return;

      if (result.error) {
        setError(result.error);
        return;
      }
      setEntries(result.entries);
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, path]);

  if (error) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-xs text-destructive">
        <AlertCircle className="h-3.5 w-3.5" />
        {error}
      </div>
    );
  }

  if (entries === null) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading...
      </div>
    );
  }

  return (
    <ul>
      {entries.map((entry) => {
        const isOpen = expanded.has(entry.path);
        const isActive = entry.type === "file" && entry.path === activePath;
        const { icon: FileIcon, colorClass } = entry.type === "file" ? fileIconFor(entry.name) : { icon: Folder, colorClass: "text-info" };

        return (
          <li key={entry.path}>
            <button
              type="button"
              onClick={() => {
                if (entry.type === "dir") {
                  setExpanded((prev) => {
                    const next = new Set(prev);
                    if (next.has(entry.path)) next.delete(entry.path);
                    else next.add(entry.path);
                    return next;
                  });
                } else {
                  onOpenFile(entry.path);
                }
              }}
              className={`flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-sm hover:bg-accent ${
                isActive ? "bg-accent font-medium" : ""
              }`}
              style={{ paddingLeft: `${depth * 16 + 8}px` }}
            >
              {entry.type === "dir" ? (
                <ChevronRight
                  className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${
                    isOpen ? "rotate-90" : ""
                  }`}
                />
              ) : (
                <span className="w-3.5 shrink-0" />
              )}
              <FileIcon className={`h-4 w-4 shrink-0 ${colorClass}`} />
              <span className="truncate">{entry.name}</span>
            </button>

            {entry.type === "dir" && isOpen && (
              <DirectoryLevel
                projectId={projectId}
                path={entry.path}
                depth={depth + 1}
                activePath={activePath}
                onOpenFile={onOpenFile}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
