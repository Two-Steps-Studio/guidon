import "server-only";

import { dataClient } from "@/lib/data-client";
import { normalizeProjectLanguage } from "@/lib/project-language";

/**
 * The project's language (migration 070), or null for automatic. Selects
 * "*" so a database without 070 yet just answers null instead of failing.
 */
export async function getProjectLanguage(userId: string, projectId: string): Promise<string | null> {
  const { data } = await dataClient(userId)
    .from<{ language?: string | null }>("projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();
  return normalizeProjectLanguage(data?.language);
}
