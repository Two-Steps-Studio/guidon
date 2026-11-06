"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { DIAGNOSTIC_REASONS } from "@/lib/admin/diagnostic-reasons";
import { endUserDiagnostics, startUserDiagnostics } from "./diagnostics-actions";

export function StartUserDiagnostics({ targetId }: { targetId: string }) {
  const t = useTranslations("admin.diagnostics");
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  return <form className="space-y-2 rounded-xl border p-4" onSubmit={event => {
    event.preventDefault();
    const reason = new FormData(event.currentTarget).get("reason");
    if (typeof reason !== "string" || !reason || pending) return;
    setFailed(false);
    startTransition(async () => {
      if ((await startUserDiagnostics(targetId, reason))?.error) setFailed(true);
    });
  }}>
    <h3 className="font-semibold">{t("title")}</h3>
    <label className="grid gap-1 text-sm">
      {t("reason")}
      <select name="reason" required defaultValue="" className="h-9 rounded-md border border-input bg-background px-2">
        <option value="" disabled>{t("choose")}</option>
        {DIAGNOSTIC_REASONS.map(reason => <option key={reason} value={reason}>{t(reason)}</option>)}
      </select>
    </label>
    <Button type="submit" disabled={pending}>{t("start")}</Button>
    {failed && <p role="alert">{t("failed")}</p>}
  </form>;
}

export function DiagnosticsSession({ targetId, sessionId, expiresAt, children }: {
  targetId: string; sessionId: string; expiresAt: string; children: ReactNode;
}) {
  const router = useRouter();
  const t = useTranslations("admin.diagnostics");
  const [expired, setExpired] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    const expiry = new Date(expiresAt).getTime();
    const timer = setTimeout(() => {
      setExpired(true);
      router.replace(`/admin/users/${targetId}`);
    }, Math.max(0, expiry - Date.now()));
    return () => clearTimeout(timer);
  }, [expiresAt, router, targetId]);

  if (expired) return <p role="status">{t("expired")}</p>;
  return <>
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-muted p-4">
      <p role="status">{t("banner")}</p>
      <Button type="button" variant="outline" disabled={pending} onClick={() => {
        setFailed(false);
        startTransition(async () => {
          if ((await endUserDiagnostics(targetId, sessionId))?.error) setFailed(true);
        });
      }}>{t("end")}</Button>
      {failed && <p role="alert">{t("failed")}</p>}
    </div>
    {children}
  </>;
}
