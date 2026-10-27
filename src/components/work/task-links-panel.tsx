"use client";

/**
 * Linked code for TaskDetailDialog (Smart Linking, migration 097): commits,
 * branches and PRs linked to the task. Confirmed links come from an explicit
 * guidon#ref or a person's review; suggestions are guesses from shared words
 * and say so, with the evidence, until someone confirms or rejects them.
 * Loaded lazily when the dialog opens, like the Why panel.
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, GitBranch, GitCommitHorizontal, GitPullRequest, Loader2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { loadTaskLinks, reviewTaskLinkAction } from "@/app/projects/[id]/work/links-actions";
import type { TaskLink } from "@/lib/data/task-links";

const ICON = { commit: GitCommitHorizontal, branch: GitBranch, pull_request: GitPullRequest } as const;

function refLabel(link: TaskLink): string {
  if (link.kind === "pull_request") return `${link.repository}#${link.external_ref}`;
  if (link.kind === "commit") return `${link.repository}@${link.external_ref.slice(0, 7)}`;
  return `${link.repository}:${link.external_ref}`;
}

export function TaskLinksPanel({ projectId, taskId, canEdit }: { projectId: string; taskId: string; canEdit: boolean }) {
  const t = useTranslations("work.links");
  const [links, setLinks] = useState<TaskLink[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await loadTaskLinks(projectId, taskId);
    setError(result.error);
    setLinks(result.links);
  }, [projectId, taskId]);

  useEffect(() => {
    let cancelled = false;
    loadTaskLinks(projectId, taskId).then((result) => {
      if (cancelled) return;
      setError(result.error);
      setLinks(result.links);
    });
    return () => { cancelled = true; };
  }, [projectId, taskId]);

  async function review(link: TaskLink, decision: "confirm" | "reject") {
    setBusy(link.id);
    const result = await reviewTaskLinkAction(projectId, link.id, decision);
    setBusy(null);
    if (result.error) { setError(result.error); return; }
    await load();
  }

  const visible = (links ?? []).filter((link) => link.status !== "rejected");
  const rejected = (links ?? []).length - visible.length;

  return (
    <section aria-label={t("heading")} className="space-y-3 border-t border-border pt-4">
      <h3 className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        <GitPullRequest className="h-4 w-4 text-muted-foreground" aria-hidden />
        {t("heading")}
      </h3>
      {links === null && !error ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />{t("loading")}</p>
      ) : error ? (
        <p role="alert" className="text-sm text-destructive">{error}</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}{rejected ? ` ${t("rejectedCount", { count: rejected })}` : ""}</p>
      ) : (
        <ul className="space-y-2">
          {visible.map((link) => {
            const Icon = ICON[link.kind];
            const suggested = link.status === "suggested";
            return (
              <li key={link.id} className={`rounded-md border p-2.5 ${suggested ? "border-dashed" : ""}`}>
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  {link.url ? (
                    <a href={link.url} target="_blank" rel="noopener noreferrer" className="min-w-0 break-all text-sm font-medium text-primary underline-offset-4 hover:underline">{refLabel(link)}</a>
                  ) : <span className="min-w-0 break-all text-sm font-medium">{refLabel(link)}</span>}
                  {link.pr_state && <Badge variant="outline" className="text-[10px]">{t(`state.${link.pr_state}`)}</Badge>}
                  <Badge variant={suggested ? "outline" : "secondary"} className="text-[10px]">
                    {suggested ? t("suggested", { percent: Math.round(link.confidence * 100) }) : link.provenance === "explicit_reference" ? t("referenced") : t("confirmed")}
                  </Badge>
                  {link.repository_connected === false && <Badge variant="outline" className="text-[10px]">{t("disconnected")}</Badge>}
                </div>
                {link.title && <p className="mt-1 break-words text-sm text-foreground">{link.title}</p>}
                {link.evidence && <p className="mt-0.5 break-words text-xs text-muted-foreground">{link.evidence}</p>}
                {canEdit && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {suggested && (
                      <Button type="button" size="sm" variant="outline" disabled={busy === link.id} onClick={() => void review(link, "confirm")}>
                        <Check className="h-3.5 w-3.5" aria-hidden />{t("confirm")}
                      </Button>
                    )}
                    <Button type="button" size="sm" variant="ghost" disabled={busy === link.id} onClick={() => void review(link, "reject")} aria-label={t("rejectLabel", { ref: refLabel(link) })}>
                      <X className="h-3.5 w-3.5" aria-hidden />{suggested ? t("reject") : t("notRelated")}
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
