"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, Check, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { syncPricesFromStripe } from "./actions";

export function SyncPricesButton({ disabled }: { disabled: boolean }) {
  const t = useTranslations("admin");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ error: string | null; changed?: number } | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        disabled={disabled || pending}
        onClick={() => startTransition(async () => setResult(await syncPricesFromStripe()))}
      >
        {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />}
        {t("pricesApply")}
      </Button>
      {result?.error && (
        <p role="alert" className="flex items-center gap-1 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {result.error}
        </p>
      )}
      {result && !result.error && (
        <p role="status" className="flex items-center gap-1 text-sm text-success">
          <Check className="h-4 w-4" aria-hidden="true" />
          {t("pricesApplied", { count: result.changed ?? 0 })}
        </p>
      )}
    </div>
  );
}
