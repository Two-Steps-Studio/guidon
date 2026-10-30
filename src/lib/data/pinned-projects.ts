import "server-only";

import { cache } from "react";
import { dataClient } from "@/lib/data-client";

/** At most this many projects pinned per person (migration 065's CHECK). */
export const MAX_PINNED_PROJECTS = 3;

export interface PinnedProject {
  id: string;
  name: string;
  avatar_url?: string | null;
}

/**
 * The projects this person pinned to the top of the project list and the
 * dashboard, in pinning order. Ids of projects they can no longer see are
 * dropped by the pages (they only render projects RLS returned). [] before
 * migration 065 - the column just isn't there yet.
 */
export const getPinnedProjectIds = cache(async function getPinnedProjectIds(userId: string): Promise<string[]> {
  const { data, error } = await dataClient(userId)
    .from<{ pinned_project_ids: string[] | null }>("profiles")
    .select("pinned_project_ids")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return [];
  return data.pinned_project_ids ?? [];
});

/** The projects the person pinned and can still access, in pinning order. */
export async function getPinnedProjects(userId: string): Promise<PinnedProject[]> {
  const ids = await getPinnedProjectIds(userId);
  if (ids.length === 0) return [];

  const { data } = await dataClient(userId)
    .from<PinnedProject>("projects")
    .select("id, name, avatar_url")
    .in("id", ids);
  const byId = new Map((data ?? []).map((project) => [project.id, project]));
  return ids.flatMap((id) => {
    const project = byId.get(id);
    return project ? [project] : [];
  });
}

/** `items` with the pinned ones first, in pinning order; the rest keep their order. */
export function pinnedFirst<T extends { id: string }>(items: T[], pinned: string[]): T[] {
  const rank = new Map(pinned.map((id, index) => [id, index]));
  return [...items].sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));
}
