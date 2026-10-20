"use client";

import { useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { confirmDiscordLogin } from "./actions";

export function DiscordLoginForm({ token }: { token: string }) {
  const t = useTranslations("discordLogin");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <p role="status" className="flex items-start gap-2 text-sm text-success">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        {t("done")}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("phishingWarning")}</p>
      {error && (
        <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}
      <Button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await confirmDiscordLogin(token).catch(() => ({ ok: false, error: t("genericError") }));
            if (result.ok) setDone(true);
            else setError(result.error ?? t("genericError"));
          })
        }
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        {t("confirm")}
      </Button>
    </div>
  );
}
