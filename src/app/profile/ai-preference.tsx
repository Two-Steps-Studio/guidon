"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { setHideAi } from "./actions";

/**
 * "Show AI features": off hides AI buttons and widgets in every project, for
 * this person only. Connected agents keep working - it hides, it doesn't
 * revoke (that's API keys / Connected apps below).
 */
export function AiPreferenceSection({ hideAi }: { hideAi: boolean }) {
  const t = useTranslations("profile");
  const router = useRouter();
  const [show, setShow] = useState(!hideAi);
  const [pending, startTransition] = useTransition();

  const toggle = (next: boolean) => {
    setShow(next);
    startTransition(async () => {
      const result = await setHideAi(!next).catch(() => ({ error: t("aiPreferenceFailed") }));
      if (result.error) {
        setShow(!next);
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("aiPreferenceTitle")}</CardTitle>
        <CardDescription>{t("aiPreferenceDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4 rounded-md border border-border px-3 py-2">
          <span className="text-sm font-medium">{t("aiPreferenceToggle")}</span>
          <input
            type="checkbox"
            role="switch"
            aria-checked={show}
            className="h-5 w-5 shrink-0 accent-primary"
            checked={show}
            disabled={pending}
            onChange={(event) => toggle(event.target.checked)}
          />
        </label>
        <p className="mt-2 text-xs text-muted-foreground">{t("aiPreferenceHint")}</p>
      </CardContent>
    </Card>
  );
}
