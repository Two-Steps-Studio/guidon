"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { retryInvoicePayment } from "./actions";

export function RetryInvoice({ id, amount, currency }: { id: string; amount: number; currency: string }) {
  const t = useTranslations("admin.invoices");
  const router = useRouter();
  const requestId = useRef<string | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [status, setStatus] = useState<"retryFailed" | "retryStale" | "retryPaid">();
  const [pending, startTransition] = useTransition();

  return <form className="mt-2 min-w-48 space-y-1" onSubmit={event => {
    event.preventDefault();
    if (pending || confirmation !== id) return;
    const key = requestId.current ?? crypto.randomUUID();
    requestId.current = key;
    setStatus(undefined);
    startTransition(async () => {
      try {
        const result = await retryInvoicePayment(id, confirmation, key, amount, currency);
        setStatus(result.error === null ? "retryPaid" : result.error === "stale" ? "retryStale" : "retryFailed");
        if (result.error === null) {
          setConfirmation("");
          router.refresh();
        }
      } catch {
        setStatus("retryFailed");
      }
    });
  }}>
    <label className="grid gap-1">{t("retryConfirm", { id })}
      <Input value={confirmation} onChange={event => setConfirmation(event.target.value)}
        autoComplete="off" spellCheck={false} maxLength={103} disabled={pending} />
    </label>
    <Button type="submit" size="sm" variant="outline" disabled={pending || confirmation !== id || status === "retryPaid"}>
      {t("retry")}
    </Button>
    {status && <p role={status === "retryPaid" ? "status" : "alert"}>{t(status)}</p>}
  </form>;
}
