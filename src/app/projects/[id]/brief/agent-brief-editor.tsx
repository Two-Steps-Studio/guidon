"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Download, Loader2, RefreshCw } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { confirmAction } from "@/components/ui/confirm-action";
import { BRIEF_MAX_CHARS, briefStats } from "@/lib/context/agent-brief-core";
import type { AgentBriefVersion } from "@/lib/data/agent-brief";
import { approveBrief, generateBriefDraft } from "./actions";

/**
 * Generate a draft from the project's data, edit it, approve it as the next
 * version. Approved versions never change; agents read the latest one.
 * People who can't approve see the latest version and the history.
 */
export function AgentBriefEditor({
  projectId,
  versions: initialVersions,
  names,
  canApprove,
}: {
  projectId: string;
  versions: AgentBriefVersion[];
  names: Record<string, string>;
  canApprove: boolean;
}) {
  const t = useTranslations("agentBrief");
  const format = useFormatter();
  const router = useRouter();
  const [versions, setVersions] = useState(initialVersions);
  const latest = versions[0] ?? null;
  const [draft, setDraft] = useState(latest?.content ?? "");
  const [shown, setShown] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const stats = briefStats(draft);
  const edited = draft !== (latest?.content ?? "");
  const viewing = shown === null ? null : versions.find((version) => version.version === shown) ?? null;

  const generate = async () => {
    if (draft.trim() && edited && !(await confirmAction(t("confirmRegenerate"), t("regenerate")))) return;
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await generateBriefDraft(projectId);
      if (result.error || result.draft === null) setError(result.error ?? t("failed"));
      else setDraft(result.draft);
    });
  };

  const approve = () => {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await approveBrief(projectId, draft);
      if (result.error || !result.version) {
        setError(result.error ?? t("failed"));
        return;
      }
      setVersions((current) => [result.version!, ...current]);
      setDraft(result.version.content);
      setNotice(t("approved", { version: result.version.version }));
      // Picks up the approver's name for the history.
      router.refresh();
    });
  };

  const download = (version: AgentBriefVersion) => {
    const url = URL.createObjectURL(new Blob([version.content], { type: "text/markdown" }));
    const link = Object.assign(document.createElement("a"), { href: url, download: `agent-brief-v${version.version}.md` });
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_16rem]">
      <section className="min-w-0 space-y-3">
        {canApprove ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => void generate()} disabled={pending}>
                <RefreshCw className="h-4 w-4" />
                {draft.trim() ? t("regenerate") : t("generate")}
              </Button>
              <Button type="button" size="sm" onClick={approve} disabled={pending || !draft.trim() || !edited}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {t("approve", { version: (latest?.version ?? 0) + 1 })}
              </Button>
            </div>
            <Textarea
              aria-label={t("editorLabel")}
              value={draft}
              maxLength={BRIEF_MAX_CHARS}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={t("emptyDraft")}
              rows={22}
              className="font-mono text-sm"
            />
            {draft.trim() && (
              <p className="text-xs text-muted-foreground">
                {t("stats", { claims: stats.claims, unsourced: stats.unsourced, unverified: stats.unverified })}
              </p>
            )}
          </>
        ) : latest ? (
          <pre className="whitespace-pre-wrap break-words rounded-xl border border-border bg-card p-4 text-sm">{latest.content}</pre>
        ) : (
          <p className="text-sm text-muted-foreground">{t("noneYet")}</p>
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
        <p className="text-xs text-muted-foreground">{t("howAgentsRead", { projectId })}</p>
      </section>

      <aside className="space-y-2">
        <h2 className="text-sm font-semibold">{t("history")}</h2>
        {versions.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("noVersions")}</p>
        ) : (
          <ul className="space-y-1.5">
            {versions.map((version) => (
              <li key={version.id} className="rounded-lg border border-border p-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    className="font-medium underline-offset-2 hover:underline"
                    aria-expanded={shown === version.version}
                    onClick={() => setShown(shown === version.version ? null : version.version)}
                  >
                    {t("versionLabel", { version: version.version })}
                    {version.version === latest?.version && <span className="ml-1 text-muted-foreground">· {t("current")}</span>}
                  </button>
                  <button type="button" aria-label={t("download", { version: version.version })} onClick={() => download(version)}>
                    <Download className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="mt-0.5 text-muted-foreground">
                  {t("approvedBy", {
                    person: (version.approved_by && names[version.approved_by]) || t("unknown"),
                    date: format.dateTime(new Date(version.approved_at), { dateStyle: "medium" }),
                  })}
                </p>
              </li>
            ))}
          </ul>
        )}
        {viewing && (
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/40 p-2 text-xs">{viewing.content}</pre>
        )}
      </aside>
    </div>
  );
}
