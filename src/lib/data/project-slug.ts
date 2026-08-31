import "server-only";

import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { createClient } from "@/lib/supabase-server";
import { uniqueSlug } from "@/lib/slug";

/**
 * Every sibling project's slug within an organization, for both computing a
 * new unique slug (uniqueSlug() in src/lib/slug.ts) and counting existing
 * projects for the hosted per-org project limit (src/lib/limits.ts) - the
 * same query was duplicated near-verbatim across createProject
 * (organizations/[id]/actions.ts) and createProjectForImport
 * (projects/import-actions.ts). projects.slug is NOT NULL (002), so every
 * row always contributes one entry - the array's length is also the
 * sibling count.
 */
async function siblingProjectSlugs(orgId: string, userId: string): Promise<string[]> {
  if (hasDirectDatabase()) {
    const result = await withUser(userId, ({ query }) =>
      query("SELECT slug FROM projects WHERE organization_id = $1", [orgId])
    );
    return result.rows
      .map((row: { slug: string | null }) => row.slug)
      .filter((value: string | null): value is string => Boolean(value));
  }

  const supabase = await createClient();
  const { data } = await supabase.from("projects").select("slug").eq("organization_id", orgId);
  return (data ?? [])
    .map((row: { slug: string | null }) => row.slug)
    .filter((value): value is string => Boolean(value));
}

export interface UniqueProjectSlugResult {
  slug: string;
  /** Sibling project count - also what isHostedProjectLimitReached() needs. */
  siblingCount: number;
}

/** Computes a slug for `name` that's unique among `orgId`'s existing projects. */
export async function getUniqueProjectSlug(
  orgId: string,
  userId: string,
  name: string
): Promise<UniqueProjectSlugResult> {
  const siblings = await siblingProjectSlugs(orgId, userId);
  return { slug: uniqueSlug(name, siblings), siblingCount: siblings.length };
}
