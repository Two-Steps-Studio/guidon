"use client";
import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { confirmAction } from "./confirm-action";

export function useGuardedClose(dirty: boolean, busy: boolean, close: () => void) {
  const t = useTranslations("common");
  const asking = useRef(false);
  const unloadGuard = useRef<((event: BeforeUnloadEvent) => void) | null>(null);
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();event.returnValue = "";
    };
    unloadGuard.current = beforeUnload;
    window.addEventListener("beforeunload", beforeUnload);
    return () => { window.removeEventListener("beforeunload", beforeUnload); unloadGuard.current = null; };
  }, [dirty]);
  return async (leave: () => void = close, options?: { unload?: boolean }) => {
    if (busy || asking.current) return;
    if (!dirty) return leave();
    asking.current = true;
    try { if (await confirmAction(t("discardChangesQuestion"), t("discardChanges"))) {
      // Remove only this form's guard after consent to a document navigation.
      // WebKit can dispatch beforeunload after a zero-delay timer has fired.
      // Cancelled and in-app navigation keep the listener intact.
      const guard = options?.unload ? unloadGuard.current : null;
      if (guard) window.removeEventListener("beforeunload", guard);
      try { leave(); } catch (error) {
        if (guard) window.addEventListener("beforeunload", guard);
        throw error;
      }
    } }
    finally { asking.current = false; }
  };
}
