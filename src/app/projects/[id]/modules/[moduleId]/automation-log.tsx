"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { retryModuleAutomation } from "./automation-actions";

export type AutomationRunView = { id: string; automation: string; event: string; status: "pending" | "succeeded" | "failed"; attempts: number; lastError: string | null; createdAt: string };

export function AutomationLog({ projectId, moduleId, runs }: { projectId: string; moduleId: string; runs: AutomationRunView[] }) {
  const t = useTranslations("moduleAutomations");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState<string | null>(null);
  if (!runs.length) return <p className="text-sm text-muted-foreground">{t("noRuns")}</p>;
  return <div className="max-w-full overflow-x-auto"><table className="w-full text-left text-sm">
    <caption className="sr-only">{t("runsTitle")}</caption>
    <thead><tr className="border-b text-muted-foreground [&>th]:p-2 [&>th]:font-medium"><th scope="col">{t("colWhen")}</th><th scope="col">{t("colAutomation")}</th><th scope="col">{t("colStatus")}</th><th scope="col">{t("colAttempts")}</th><th scope="col"><span className="sr-only">{t("colActions")}</span></th></tr></thead>
    <tbody>{runs.map((run) => <tr key={run.id} className="border-b align-top last:border-0 [&>td]:p-2">
      <td className="whitespace-nowrap"><time dateTime={run.createdAt}>{run.createdAt.slice(0, 16).replace("T", " ")}</time></td>
      <td className="break-words">{run.automation}<span className="block text-xs text-muted-foreground">{t(`event.${run.event as "record.created" | "record.updated" | "record.deleted"}`)}</span></td>
      <td>{t(`status.${run.status}`)}{run.lastError && <span className="block max-w-72 break-words text-xs text-destructive">{run.lastError}</span>}</td>
      <td className="tabular-nums">{run.attempts}</td>
      <td>{run.status === "failed" && <Button size="sm" variant="outline" disabled={pending} aria-label={t("retryAria", { automation: run.automation })} onClick={() => start(async () => { const ok = await retryModuleAutomation(projectId, moduleId, run.id); setFailed(ok ? null : run.id); router.refresh(); })}>{t("retry")}</Button>}
        {failed === run.id && <p role="alert" className="text-xs text-destructive">{t("retryFailed")}</p>}</td>
    </tr>)}</tbody>
  </table></div>;
}
