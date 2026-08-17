"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  AlertCircle,
  Boxes,
  Brain,
  Code,
  Cpu,
  Database,
  Loader2,
  Pencil,
  Plus,
  Server,
  Settings2,
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
import { useProjectAccess } from "@/contexts/project-access-context";
import type { Technology, TechnologyCategory } from "@/types/technology";
import {
  DEFAULT_TECHNOLOGY_CATEGORY,
  TECHNOLOGY_CATEGORIES,
  TECHNOLOGY_CATEGORY_LABELS,
  TECHNOLOGY_CATEGORY_ORDER,
  guessTechnologyCategory,
  technologySlug,
} from "@/types/technology";

const CATEGORY_ICONS: Record<TechnologyCategory, typeof Code> = {
  frontend: Code,
  backend: Server,
  game_engine: Boxes,
  database: Database,
  devops: Settings2,
  ai: Brain,
  other: Cpu,
};

/**
 * One accent per category, drawn from the design tokens rather than raw
 * Tailwind colours, so the page follows the theme in both light and dark.
 */
const CATEGORY_ACCENT: Record<TechnologyCategory, string> = {
  frontend: "text-info",
  backend: "text-success",
  game_engine: "text-primary",
  database: "text-warning",
  devops: "text-muted-foreground",
  ai: "text-priority-critical",
  other: "text-muted-foreground",
};

interface TechForm {
  name: string;
  category: TechnologyCategory;
  version: string;
  description: string;
}

const EMPTY_FORM: TechForm = {
  name: "",
  category: DEFAULT_TECHNOLOGY_CATEGORY,
  version: "",
  description: "",
};

export default function ProjectTechnologyPage() {
  const params = useParams();
  const projectId = params.id as string;

  // Project identity and role are resolved once, server-side, in
  // /projects/[id]/layout.tsx — this page no longer re-authenticates.
  const { project, role, canManage } = useProjectAccess();

  const [technologies, setTechnologies] = useState<Technology[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Technology | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const supabase = createClient();

      const { data, error: techError } = await supabase
        .from("technologies")
        .select("*")
        .eq("project_id", projectId)
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("name", { ascending: true });

      setError(null);

      if (techError) throw techError;

      setTechnologies((data ?? []) as Technology[]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load technologies"
      );
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    // See ../work/page.tsx: every setState in `load` happens after an await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  /** Grouped for rendering; empty categories are dropped. */
  const grouped = useMemo(() => {
    return TECHNOLOGY_CATEGORY_ORDER.map((category) => ({
      category,
      items: technologies.filter(
        (tech) => (tech.category ?? "other") === category
      ),
    })).filter((group) => group.items.length > 0);
  }, [technologies]);

  const handleDelete = async (tech: Technology) => {
    const previous = technologies;
    setTechnologies((current) => current.filter((t) => t.id !== tech.id));

    try {
      const supabase = createClient();
      const { error: deleteError } = await supabase
        .from("technologies")
        .delete()
        .eq("id", tech.id);

      if (deleteError) throw deleteError;
    } catch (err) {
      setTechnologies(previous);
      setError(
        err instanceof Error ? err.message : "Could not remove that technology"
      );
    }
  };

  if (loading) {
    return (
      <>
        <div className="flex min-h-[60vh] items-center justify-center">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading technologies...
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="mx-auto max-w-4xl p-6">
        <header className="mb-6 flex flex-wrap items-end gap-4">
          <div className="flex-1">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Technologies
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {project.name}
              {technologies.length > 0 && (
                <>
                  {" · "}
                  <span className="tabular-nums">{technologies.length}</span>
                </>
              )}
            </p>
          </div>

          {canManage && (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" />
              Add technology
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

        {!canManage && role && (
          <p className="mb-4 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
            You have <strong className="font-medium">{role}</strong> access —
            only owners and admins can change the stack.
          </p>
        )}

        {technologies.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-16 text-center">
            <h2 className="text-sm font-medium text-foreground">
              No technologies yet
            </h2>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              {canManage
                ? "Record the stack so new people — and agents — know what this project is built with."
                : "Nobody has recorded this project's stack yet."}
            </p>
            {canManage && (
              <Button
                size="sm"
                className="mt-4"
                onClick={() => setCreating(true)}
              >
                <Plus className="h-4 w-4" />
                Add technology
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map(({ category, items }) => {
              const Icon = CATEGORY_ICONS[category];

              return (
                <section key={category}>
                  <h2 className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    <Icon
                      className={cn("h-3.5 w-3.5", CATEGORY_ACCENT[category])}
                      aria-hidden
                    />
                    {TECHNOLOGY_CATEGORY_LABELS[category]}
                    <span className="tabular-nums">{items.length}</span>
                  </h2>

                  <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                    {items.map((tech) => (
                      <li
                        key={tech.id}
                        className="group flex items-start gap-3 bg-card p-3 transition-colors hover:bg-surface-hover"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-2">
                            <span className="text-sm font-medium text-foreground">
                              {tech.name}
                            </span>
                            {tech.version && (
                              <span className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] leading-none text-muted-foreground">
                                {tech.version}
                              </span>
                            )}
                          </div>
                          {tech.description && (
                            <p className="mt-1 text-sm text-muted-foreground">
                              {tech.description}
                            </p>
                          )}
                        </div>

                        {canManage && (
                          <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground"
                              aria-label={`Edit ${tech.name}`}
                              onClick={() => setEditing(tech)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              aria-label={`Remove ${tech.name}`}
                              onClick={() => void handleDelete(tech)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>

      {(creating || editing) && (
        <TechnologyDialog
          key={editing?.id ?? "new"}
          projectId={projectId}
          technology={editing}
          existingCount={technologies.length}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={(saved) => {
            setTechnologies((current) =>
              current.some((t) => t.id === saved.id)
                ? current.map((t) => (t.id === saved.id ? saved : t))
                : [...current, saved]
            );
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function TechnologyDialog({
  projectId,
  technology,
  existingCount,
  onClose,
  onSaved,
}: {
  projectId: string;
  technology: Technology | null;
  existingCount: number;
  onClose: () => void;
  onSaved: (tech: Technology) => void;
}) {
  const [form, setForm] = useState<TechForm>(() =>
    technology
      ? {
          name: technology.name,
          category: technology.category ?? DEFAULT_TECHNOLOGY_CATEGORY,
          version: technology.version ?? "",
          description: technology.description ?? "",
        }
      : EMPTY_FORM
  );
  /** Once the user picks a category, stop overwriting it from the name. */
  const [categoryTouched, setCategoryTouched] = useState(Boolean(technology));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const supabase = createClient();
      const payload = {
        name: form.name.trim(),
        // NOT NULL in the database.
        category: form.category,
        version: form.version.trim() || null,
        description: form.description.trim() || null,
        icon_slug: technologySlug(form.name),
      };

      const query = technology
        ? supabase.from("technologies").update(payload).eq("id", technology.id)
        : supabase
            .from("technologies")
            .insert({
              ...payload,
              project_id: projectId,
              sort_order: existingCount,
            });

      const { data, error: saveError } = await query.select().single();

      if (saveError) throw saveError;

      onSaved(data as Technology);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save technology";

      // Most likely cause when the value is game_engine.
      setError(
        /violates check constraint/i.test(message) &&
          form.category === "game_engine"
          ? "The database does not accept 'Game engine' yet — run migration 008."
          : message
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">
            {technology ? "Edit technology" : "Add technology"}
          </DialogTitle>
          <DialogDescription>
            Name and category are enough; version and notes are optional.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tech-name">Name</Label>
            <Input
              id="tech-name"
              value={form.name}
              required
              autoFocus
              placeholder="Unreal Engine"
              onChange={(event) => {
                const name = event.target.value;
                setForm((current) => ({
                  ...current,
                  name,
                  category: categoryTouched
                    ? current.category
                    : guessTechnologyCategory(name),
                }));
              }}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tech-category">Category</Label>
              <Select
                id="tech-category"
                value={form.category}
                onChange={(event) => {
                  setCategoryTouched(true);
                  setForm((current) => ({
                    ...current,
                    category: event.target.value as TechnologyCategory,
                  }));
                }}
              >
                {TECHNOLOGY_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {TECHNOLOGY_CATEGORY_LABELS[category]}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tech-version">Version</Label>
              <Input
                id="tech-version"
                value={form.version}
                placeholder="5.4"
                onChange={(event) =>
                  setForm({ ...form, version: event.target.value })
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tech-description">Notes</Label>
            <Textarea
              id="tech-description"
              rows={3}
              value={form.description}
              placeholder="Why this, and anything the team should know."
              onChange={(event) =>
                setForm({ ...form, description: event.target.value })
              }
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
              disabled={submitting || !form.name.trim()}
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {technology ? "Save changes" : "Add technology"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
