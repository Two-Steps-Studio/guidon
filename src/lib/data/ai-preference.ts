import "server-only";

import { cache } from "react";
import { dataClient } from "@/lib/data-client";

/**
 * Whether this person hid AI for themselves (profiles.hide_ai, migration
 * 099). Read on its own, not in getCurrentUser(): before 099 is applied the
 * column doesn't exist, and this then answers "show AI" instead of breaking
 * every page that loads the user.
 */
export const getHideAi = cache(async function getHideAi(userId: string): Promise<boolean> {
  try {
    const { data, error } = await dataClient(userId)
      .from<{ hide_ai: boolean }>("profiles")
      .select("hide_ai")
      .eq("id", userId)
      .maybeSingle();
    return !error && data?.hide_ai === true;
  } catch {
    return false;
  }
});

/** AI shows only when the project allows it (046) and the person hasn't hidden it (099). */
export async function showAi(userId: string, projectAiEnabled: boolean): Promise<boolean> {
  return projectAiEnabled && !(await getHideAi(userId));
}
