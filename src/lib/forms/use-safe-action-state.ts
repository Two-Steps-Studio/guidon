"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { isNetworkError } from "@/lib/work/task-drafts";

/**
 * useActionState for forms that save. A Server Action that throws (no
 * connection, a 500) would otherwise reach the error boundary and replace
 * the page, losing what was typed; here it becomes the form's own error, the
 * fields keep their values (with submitKeepingValues) and Save tries again.
 */
export function useSafeActionState<S extends { error?: string | null }>(
  action: (state: S, data: FormData) => Promise<S>,
  initialState: S
) {
  const t = useTranslations("errors");
  return useActionState<S, FormData>(async (state, data) => {
    try {
      return await action(state, data);
    } catch (error) {
      console.error(error);
      return { ...state, error: t(isNetworkError(error) ? "saveNetwork" : "saveFailed") };
    }
  }, initialState as Awaited<S>);
}
