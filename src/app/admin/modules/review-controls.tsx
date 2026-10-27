"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { resolveModuleReport, reviewModuleVersion, withdrawModuleVersionAsAdmin } from "./actions";

export function ReviewControls({ moduleId, version, ownSubmission }: { moduleId: string; version: string; ownSubmission: boolean }) {
  const t = useTranslations("moduleRegistry");
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (decision: "approve" | "reject") => start(async () => {
    const result = await reviewModuleVersion(moduleId, version, decision, note);
    setError(result.error);
    if (!result.error) router.refresh();
  });
  if (ownSubmission) return <p className="text-sm text-muted-foreground">{t("ownSubmission")}</p>;
  return <div className="space-y-2">
    <label className="block space-y-1 text-sm"><span>{t("reviewNote")}</span><Textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} rows={2} disabled={pending} /></label>
    <div className="flex flex-wrap gap-2"><Button size="sm" disabled={pending} onClick={() => run("approve")}>{t("approve")}</Button><Button size="sm" variant="outline" disabled={pending} onClick={() => run("reject")}>{t("reject")}</Button></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}

export function ReportControls({ reportId, moduleId, version }: { reportId: string; moduleId: string; version: string }) {
  const t = useTranslations("moduleRegistry");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<{ error: string | null }>) => start(async () => { const result = await fn(); setError(result.error); if (!result.error) router.refresh(); });
  return <div className="space-y-1">
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={pending} onClick={() => act(() => resolveModuleReport(reportId))}>{t("resolveReport")}</Button>
      <Button size="sm" variant="outline" className="text-destructive" disabled={pending} onClick={() => act(() => withdrawModuleVersionAsAdmin(moduleId, version, "Withdrawn after a report"))}>{t("withdrawVersion")}</Button>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}
