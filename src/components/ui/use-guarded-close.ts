"use client";
import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { confirmAction } from "./confirm-action";

export function useGuardedClose(dirty: boolean, busy: boolean, close: () => void) {
  const t = useTranslations("common");
  const asking = useRef(false);
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault();event.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);
  return async (leave: () => void = close) => {
    if (busy || asking.current) return;
    if (!dirty) return leave();
    asking.current = true;
    try { if (await confirmAction(t("discardChangesQuestion"), t("discardChanges"))) leave(); }
    finally { asking.current = false; }
  };
}
