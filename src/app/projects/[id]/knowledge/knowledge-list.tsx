"use client";

import Link from "next/link";
import { ArrowRight, ExternalLink, FileText, FolderOpen, StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";
import { CreateSourceDialog } from "./create-source-dialog";
import { SourceCardMenu } from "./source-card-menu";
import { TYPE_LABELS } from "./source-config";
import type { ContextSource } from "@/types/context";

interface KnowledgeCounts {
  decisions: number;
  files: number;
  memory: number;
}

export function KnowledgeList({
  projectId,
  initialSources,
  counts,
  canWrite,
  canDelete,
}: {
  projectId: string;
  initialSources: ContextSource[];
  counts: KnowledgeCounts;
  canWrite: boolean;
  canDelete: boolean;
}) {
  const sources = initialSources;

  return (
    <div className="mx-auto max-w-5xl p-6">
      <header className="mb-6 flex flex-wrap items-end gap-4">
        <div className="flex-1">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Knowledge</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Documentation, notes and references that explain this project.
          </p>
        </div>

        {canWrite && <CreateSourceDialog projectId={projectId} />}
      </header>

      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        <KnowledgeLink
          href={`/projects/${projectId}/decisions`}
          icon={FileText}
          label="Decisions"
          count={counts.decisions}
          description="Why the project is the way it is"
        />
        <KnowledgeLink
          href={`/projects/${projectId}/files`}
          icon={FolderOpen}
          label="Files"
          count={counts.files}
          description="Documents, art and source assets"
        />
        <KnowledgeLink
          href={`/projects/${projectId}/memory`}
          icon={StickyNote}
          label="Memory"
          count={counts.memory}
          description="Rules, constraints and observations"
        />
      </div>

      <h2 className="mb-3 text-sm font-medium text-foreground">
        Entries
        {sources.length > 0 && (
          <span className="ml-1.5 text-xs font-normal tabular-nums text-muted-foreground">
            {sources.length}
          </span>
        )}
      </h2>

      {sources.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center">
          <h3 className="text-sm font-medium text-foreground">No knowledge entries yet</h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            {canWrite
              ? "Capture a spec, a meeting note or a reference link so the context outlives the conversation."
              : "Nothing has been documented for this project yet."}
          </p>
          {canWrite && (
            <div className="mt-4 flex justify-center">
              <CreateSourceDialog projectId={projectId} />
            </div>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {sources.map((source) => (
            <li key={source.id} className="group flex gap-3 bg-card p-4 transition-colors hover:bg-surface-hover">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-medium text-foreground">{source.title || "Untitled"}</h3>
                  <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] leading-none text-muted-foreground">
                    {TYPE_LABELS[source.source_type] ?? source.source_type}
                  </span>
                </div>

                {source.content && (
                  <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-muted-foreground">
                    {source.content}
                  </p>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                  <time dateTime={source.created_at}>{new Date(source.created_at).toLocaleDateString()}</time>
                  {source.url && (
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-primary hover:underline"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <ExternalLink className="h-3 w-3" />
                      Open link
                    </a>
                  )}
                </div>
              </div>

              {canWrite && (
                <div className="opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                  <SourceCardMenu projectId={projectId} source={source} canDelete={canDelete} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function KnowledgeLink({
  href,
  icon: Icon,
  label,
  count,
  description,
}: {
  href: string;
  icon: typeof FileText;
  label: string;
  count: number;
  description: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group rounded-xl border border-border bg-card p-4 transition-colors",
        "hover:border-border-hover hover:bg-surface-hover",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      )}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="ml-auto text-sm tabular-nums text-muted-foreground">{count}</span>
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </Link>
  );
}
