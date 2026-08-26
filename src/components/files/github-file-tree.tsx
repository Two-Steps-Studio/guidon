"use client";

import { useEffect, useState } from "react";
import { AlertCircle, ChevronRight, File, Folder, Loader2 } from "lucide-react";
import { listRepoDirectory } from "@/app/projects/[id]/files/github-actions";
import type { GithubTreeEntry } from "@/lib/github/client";

interface GithubFileTreeProps {
  projectId: string;
  onOpenFile: (path: string) => void;
}

export function GithubFileTree({ projectId, onOpenFile }: GithubFileTreeProps) {
  return (
    <div className="rounded-md border border-border">
      <DirectoryLevel projectId={projectId} path="" depth={0} onOpenFile={onOpenFile} />
    </div>
  );
}

function DirectoryLevel({
  projectId,
  path,
  depth,
  onOpenFile,
}: {
  projectId: string;
  path: string;
  depth: number;
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
              className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-sm hover:bg-accent"
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
              {entry.type === "dir" ? (
                <Folder className="h-4 w-4 shrink-0 text-info" />
              ) : (
                <File className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span className="truncate">{entry.name}</span>
            </button>

            {entry.type === "dir" && isOpen && (
              <DirectoryLevel projectId={projectId} path={entry.path} depth={depth + 1} onOpenFile={onOpenFile} />
            )}
          </li>
        );
      })}
    </ul>
  );
}
