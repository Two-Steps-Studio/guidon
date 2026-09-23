"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Search, X } from "lucide-react";
import {
  loadTaskRelatedTasks,
  searchProjectTasksByTitle,
  type RelatedTask,
} from "@/app/projects/[id]/work/relations-actions";
// Imported directly from their defining "use server" module rather than via
// relations-actions.ts's re-export - a "use server" file's action exports
// must be async functions it defines itself; re-exporting them from another
// "use server" module isn't recognized by Next's action transform and made
// the whole relations-actions.ts module resolve with zero exports at build
// time (see the export removed from relations-actions.ts).
import { createRelation, deleteRelation } from "@/app/projects/[id]/context/actions";
import type { BoardColumn } from "@/lib/work/task-board";

export function TaskRelationsSection({
  projectId,
  taskId,
  columns,
  canView,
  canLink,
  canRemove,
  onNavigateToTask,
}: {
  projectId: string;
  taskId: string;
  columns: readonly BoardColumn[];
  canView: boolean;
  canLink: boolean;
  canRemove: boolean;
  onNavigateToTask?: (taskId: string) => void;
}) {
  const t = useTranslations("work");
  const [relations, setRelations] = useState<RelatedTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<{ id: string; title: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadRelations = async () => {
    setLoading(true);
    const result = await loadTaskRelatedTasks(projectId, taskId);
    if (result.error) setError(result.error);
    else {
      setError(null);
      setRelations(result.relations);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!canView) return;
    let cancelled = false;
    (async () => {
      const result = await loadTaskRelatedTasks(projectId, taskId);
      if (cancelled) return;
      if (result.error) setError(result.error);
      else setRelations(result.relations);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, taskId, canView]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();

    if (trimmed.length === 0) {
      // Queue the clear the same way the real search does (inside a timeout callback)
      // rather than calling setState synchronously in the effect body.
      debounceRef.current = setTimeout(() => setMatches([]), 0);
    } else {
      debounceRef.current = setTimeout(async () => {
        setSearching(true);
        const excludeIds = [taskId, ...relations.map((r) => r.id)];
        const result = await searchProjectTasksByTitle(projectId, trimmed, excludeIds);
        setMatches(result.error ? [] : result.tasks);
        setSearching(false);
      }, 300);
    }

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- relations is read for its current value at debounce-fire time, not a reactive trigger for re-search
  }, [query, projectId, taskId]);

  const handleLink = async (relatedTaskId: string) => {
    setLinkingId(relatedTaskId);
    setError(null);

    const formData = new FormData();
    formData.set("source_type", "task");
    formData.set("source_id", taskId);
    formData.set("target_type", "task");
    formData.set("target_id", relatedTaskId);
    formData.set("relation_type", "related_to");

    const result = await createRelation(projectId, { error: null }, formData);
    if (result.error) {
      setError(result.error ?? t("failedToLinkTask"));
    } else {
      setQuery("");
      setMatches([]);
      await loadRelations();
    }
    setLinkingId(null);
  };

  const handleRemove = async (relation: RelatedTask) => {
    setRemovingId(relation.relationId);
    setError(null);

    const result = await deleteRelation(projectId, relation.relationId);
    if (result.error) setError(result.error ?? t("failedToRemoveRelation"));
    else setRelations((current) => current.filter((r) => r.relationId !== relation.relationId));

    setRemovingId(null);
  };

  if (!canView) return null;

  return (
    <section aria-label={t("relatedTasks")} className="space-y-3 border-t border-border pt-4">
      <h3 className="text-sm font-medium text-foreground">
        {t("relatedTasks")}
        {relations.length > 0 && (
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">{relations.length}</span>
        )}
      </h3>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t("loadingRelatedTasks")}
        </p>
      ) : relations.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noRelatedTasksYet")}</p>
      ) : (
        <ul className="space-y-1.5">
          {relations.map((relation) => {
            const column = columns.find((c) => c.status === relation.status);
            return (
              <li
                key={relation.relationId}
                className="group flex items-center gap-2 rounded-md border border-border p-2 text-sm"
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${column?.accentClass ?? "bg-muted-foreground"}`} />
                {onNavigateToTask ? (
                  <button
                    type="button"
                    onClick={() => onNavigateToTask(relation.id)}
                    className="min-w-0 flex-1 truncate text-left hover:underline"
                  >
                    {relation.title}
                  </button>
                ) : (
                  <span className="min-w-0 flex-1 truncate">{relation.title}</span>
                )}
                {canRemove && (
                  <button
                    type="button"
                    aria-label={t("removeRelationAria", { title: relation.title })}
                    disabled={removingId === relation.relationId}
                    onClick={() => void handleRemove(relation)}
                    className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 max-md:opacity-100 disabled:opacity-60"
                  >
                    {removingId === relation.relationId ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <X className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canLink && (
        <div className="space-y-1.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("searchTasksPlaceholder")}
              className="w-full rounded-md border border-input bg-background py-1.5 pl-7 pr-2 text-sm"
            />
          </div>
          {query.trim().length > 0 && (
            <ul className="space-y-1 rounded-md border border-border">
              {searching ? (
                <li className="p-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                </li>
              ) : matches.length === 0 ? (
                <li className="p-2 text-sm text-muted-foreground">{t("noMatchingTasks")}</li>
              ) : (
                matches.map((match) => (
                  <li key={match.id}>
                    <button
                      type="button"
                      disabled={linkingId === match.id}
                      onClick={() => void handleLink(match.id)}
                      className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-60"
                    >
                      <span className="min-w-0 truncate">{match.title}</span>
                      {linkingId === match.id && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />}
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
