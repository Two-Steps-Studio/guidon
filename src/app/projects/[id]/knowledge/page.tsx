"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  ExternalLink,
  FileText,
  FolderOpen,
  Loader2,
  Plus,
  StickyNote,
  Trash2,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ContextSource, SourceType } from "@/types/context";
import type { ProjectRole } from "@/types/project";

const CAN_MANAGE: ProjectRole[] = ["owner", "admin", "developer"];

/**
 * The knowledge layer is deliberately built on context_sources rather than a
 * new documents table: a source already carries a title, body, url and author,
 * and is already reachable from the project graph via context_relations. When
 * a richer editor arrives it can upgrade these rows in place.
 */
const AUTHORABLE_TYPES: { value: SourceType; label: string; hint: string }[] = [
  {
    value: "document",
    label: "Document",
    hint: "Specs, design docs, onboarding notes",
  },
  {
    value: "meeting",
    label: "Meeting note",
    hint: "What was discussed and agreed",
  },
  {
    value: "external_url",
    label: "Link",
    hint: "Reference material living elsewhere",
  },
  { value: "other", label: "Note", hint: "Anything else worth remembering" },
];

const TYPE_LABELS: Record<SourceType, string> = {
  document: "Document",
  comment: "Comment",
  commit: "Commit",
  pull_request: "Pull request",
  issue: "Issue",
  external_url: "Link",
  meeting: "Meeting note",
  file: "File",
  other: "Note",
};

interface KnowledgeCounts {
  decisions: number;
  files: number;
  memory: number;
}

export default function ProjectKnowledgePage() {
  const params = useParams();
  const projectId = params.id as string;

  const [sources, setSources] = useState<ContextSource[]>([]);
  const [counts, setCounts] = useState<KnowledgeCounts>({
    decisions: 0,
    files: 0,
    memory: 0,
  });
  const [role, setRole] = useState<ProjectRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // State is only touched past this first await, so an effect-triggered
      // load never re-renders synchronously from the effect body.
      setError(null);
      setForbidden(false);

      if (!user) {
        setForbidden(true);
        return;
      }

      const { data: project, error: projectError } = await supabase
        .from("projects")
        .select("id")
        .eq("id", projectId)
        .maybeSingle();

      if (projectError) throw projectError;
      if (!project) {
        setForbidden(true);
        return;
      }

      const [sourcesRes, decisionsRes, filesRes, memoryRes, membershipRes] =
        await Promise.all([
          supabase
            .from("context_sources")
            .select("*")
            .eq("project_id", projectId)
            .order("created_at", { ascending: false }),
          supabase
            .from("context_decisions")
            .select("id")
            .eq("project_id", projectId),
          supabase
            .from("project_files")
            .select("id")
            .eq("project_id", projectId),
          supabase
            .from("project_memory")
            .select("id")
            .eq("project_id", projectId),
          supabase
            .from("project_members")
            .select("role")
            .eq("project_id", projectId)
            .eq("user_id", user.id)
            .maybeSingle(),
        ]);

      if (sourcesRes.error) throw sourcesRes.error;

      setSources((sourcesRes.data ?? []) as ContextSource[]);
      setCounts({
        decisions: decisionsRes.data?.length ?? 0,
        files: filesRes.data?.length ?? 0,
        memory: memoryRes.data?.length ?? 0,
      });
      setRole((membershipRes.data?.role as ProjectRole) ?? null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load knowledge"
      );
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // See the note on the equivalent effect in ../work/page.tsx: every setState
  // in `load` happens after an await, and a Server Component is the real fix.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const canManage = role !== null && CAN_MANAGE.includes(role);

  const handleDelete = async (sourceId: string) => {
    const previous = sources;
    setSources((current) => current.filter((item) => item.id !== sourceId));

    try {
      const supabase = createClient();
      const { error: deleteError } = await supabase
        .from("context_sources")
        .delete()
        .eq("id", sourceId);

      if (deleteError) throw deleteError;
    } catch (err) {
      setSources(previous);
      setError(err instanceof Error ? err.message : "Failed to delete entry");
    }
  };

  if (loading) {
    return (
      <>
        <div className="flex min-h-[60vh] items-center justify-center">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading knowledge...
          </p>
        </div>
      </>
    );
  }

  if (forbidden) {
    return (
      <>
        <div className="flex min-h-[60vh] items-center justify-center p-6">
          <div className="max-w-sm text-center">
            <h2 className="text-base font-medium text-foreground">
              You don&apos;t have permission to access this project
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Ask an owner or admin of the project to add you as a member.
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="mx-auto max-w-5xl p-6">
        <header className="mb-6 flex flex-wrap items-end gap-4">
          <div className="flex-1">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Knowledge
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Documentation, notes and references that explain this project.
            </p>
          </div>

          {canManage && (
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" />
              New entry
            </Button>
          )}
        </header>

        {error && (
          <div
            role="alert"
            className="mb-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1">{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="underline underline-offset-2"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Related knowledge surfaces */}
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
            <h3 className="text-sm font-medium text-foreground">
              No knowledge entries yet
            </h3>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              {canManage
                ? "Capture a spec, a meeting note or a reference link so the context outlives the conversation."
                : "Nothing has been documented for this project yet."}
            </p>
            {canManage && (
              <Button
                size="sm"
                className="mt-4"
                onClick={() => setShowCreate(true)}
              >
                <Plus className="h-4 w-4" />
                New entry
              </Button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {sources.map((source) => (
              <li
                key={source.id}
                className="group flex gap-3 bg-card p-4 transition-colors hover:bg-surface-hover"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-medium text-foreground">
                      {source.title || "Untitled"}
                    </h3>
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
                    <time dateTime={source.created_at}>
                      {new Date(source.created_at).toLocaleDateString()}
                    </time>
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

                {canManage && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${source.title || "entry"}`}
                    className="h-7 w-7 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                    onClick={() => void handleDelete(source.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {showCreate && (
        <CreateSourceDialog
          projectId={projectId}
          onClose={() => setShowCreate(false)}
          onCreated={(source) => {
            setSources((current) => [source, ...current]);
            setShowCreate(false);
          }}
        />
      )}
    </>
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
        <span className="ml-auto text-sm tabular-nums text-muted-foreground">
          {count}
        </span>
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </Link>
  );
}

function CreateSourceDialog({
  projectId,
  onClose,
  onCreated,
}: {
  projectId: string;
  onClose: () => void;
  onCreated: (source: ContextSource) => void;
}) {
  const [type, setType] = useState<SourceType>("document");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeType = AUTHORABLE_TYPES.find((item) => item.value === type);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data, error: insertError } = await supabase
        .from("context_sources")
        .insert({
          project_id: projectId,
          source_type: type,
          title: title.trim() || null,
          content: content.trim() || null,
          url: url.trim() || null,
          author: user?.id ?? null,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      onCreated(data as ContextSource);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create entry");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">New knowledge entry</DialogTitle>
          <DialogDescription>
            {activeType?.hint ?? "Capture something worth remembering."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="source-type">Type</Label>
            <Select
              id="source-type"
              value={type}
              onChange={(event) =>
                setType(event.target.value as SourceType)
              }
            >
              {AUTHORABLE_TYPES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="source-title">Title</Label>
            <Input
              id="source-title"
              value={title}
              required
              autoFocus
              placeholder="Rendering pipeline overview"
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="source-content">Content</Label>
            <Textarea
              id="source-content"
              rows={6}
              value={content}
              placeholder="Plain text for now. A richer editor can upgrade these entries later."
              onChange={(event) => setContent(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="source-url">Link (optional)</Label>
            <Input
              id="source-url"
              type="url"
              value={url}
              placeholder="https://..."
              onChange={(event) => setUrl(event.target.value)}
            />
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={submitting || !title.trim()}
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Create entry
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
