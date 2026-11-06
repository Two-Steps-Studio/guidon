"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { revealAdminProfile } from "./actions";

export function ProfileDisclosure({ userId }: { userId: string }) {
  const t = useTranslations("admin.pii");
  const [result, setResult] = useState<Awaited<ReturnType<typeof revealAdminProfile>>>();
  const [pending, startTransition] = useTransition();

  if (result?.status === "succeeded" && result.profile) {
    return <div className="space-y-1 break-all">
      <p>{result.profile.email || "—"}</p>
      <p>{result.profile.name || "—"}</p>
      <Button size="sm" variant="ghost" onClick={() => setResult(undefined)}>{t("hide")}</Button>
    </div>;
  }

  return <div className="space-y-1">
    <Button size="sm" variant="outline" disabled={pending} onClick={() => startTransition(async () => {
      setResult(undefined);
      try {
        setResult(await revealAdminProfile(userId));
      } catch {
        setResult({ status: "unavailable" });
      }
    })}>{t(pending ? "loading" : "reveal")}</Button>
    {result && <p role="alert">{t(result.status === "limited" ? "limited" : result.status === "unavailable" ? "unavailable" : "failed")}</p>}
  </div>;
}
