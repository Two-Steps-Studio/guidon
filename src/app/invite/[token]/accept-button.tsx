"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { acceptInvitation } from "./actions";

export function AcceptInvitationButton({ token }: { token: string }) {
  const t = useTranslations("invitation");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
      <Button
        className="w-full"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await acceptInvitation(token);
            // On success the action redirects; a result only comes back on failure.
            if (result) setError(result.error);
          })
        }
      >
        {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
        {t("accept")}
      </Button>
    </div>
  );
}
