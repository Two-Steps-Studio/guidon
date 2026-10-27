"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { reportModuleVersion } from "./report-actions";

export function ReportModuleForm({ moduleId, version }: { moduleId: string; version: string }) {
  const t = useTranslations("moduleRegistry");
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("misleading");
  const [details, setDetails] = useState("");
  const [result, setResult] = useState<Awaited<ReturnType<typeof reportModuleVersion>>["result"] | null>(null);
  const [pending, start] = useTransition();
  if (result === "reported" || result === "already_reported") return <p role="status" className="text-sm">{t(`reportResult.${result}`)}</p>;
  if (!open) return <Button variant="link" className="h-auto p-0 text-sm" onClick={() => setOpen(true)}>{t("reportAbuse")}</Button>;
  return <form className="w-full space-y-2 rounded-lg border bg-card p-4" onSubmit={(event) => { event.preventDefault(); start(async () => setResult((await reportModuleVersion(moduleId, version, reason, details)).result)); }}>
    <label className="block space-y-1 text-sm"><span className="font-medium">{t("reportReason")}</span>
      <Select value={reason} onChange={(event) => setReason(event.target.value)} disabled={pending}>{(["malicious", "misleading", "privacy", "copyright", "spam", "other"] as const).map((value) => <option key={value} value={value}>{t(`reason.${value}`)}</option>)}</Select></label>
    <label className="block space-y-1 text-sm"><span className="font-medium">{t("reportDetails")}</span><Textarea value={details} onChange={(event) => setDetails(event.target.value)} maxLength={2000} rows={3} disabled={pending} /></label>
    {result && <p role="alert" className="text-sm text-destructive">{t(`reportResult.${result}`)}</p>}
    <div className="flex gap-2"><Button type="submit" size="sm" disabled={pending}>{t("sendReport")}</Button><Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setOpen(false)}>{t("cancel")}</Button></div>
  </form>;
}
