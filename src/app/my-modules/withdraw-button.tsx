"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { confirmAction } from "@/components/ui/confirm-action";
import { withdrawOwnModuleVersion } from "./actions";

export function WithdrawVersionButton({ moduleId, version }: { moduleId: string; version: string }) {
  const t = useTranslations("moduleRegistry");
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();
  return <div className="space-y-1">
    <Button size="sm" variant="outline" disabled={pending} aria-label={t("withdrawAria", { version: `${moduleId}@${version}` })} onClick={async () => {
      if (!(await confirmAction(t("withdrawConfirm")))) return;
      start(async () => { const ok = await withdrawOwnModuleVersion(moduleId, version); setFailed(!ok); if (ok) router.refresh(); });
    }}>{t("withdraw")}</Button>
    {failed && <p role="alert" className="text-xs text-destructive">{t("withdrawFailed")}</p>}
  </div>;
}
