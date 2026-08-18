import "server-only";

import { createClient } from "@/lib/supabase-server";
import type { ActivityAction } from "@/types/api";

export interface ActivityLogRow {
  id: string;
  project_id: string | null;
  organization_id: string | null;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

/**
 * Recent activity for a project, most recent first.
 *
 * `activity_logs.action` is plain `text` (000_baseline_schema.sql) — there is
 * no CHECK constraint pinning it to `ActivityAction` (src/types/api.ts), and
 * nothing in this codebase currently inserts a row (no `.from("activity_logs")`
 * write anywhere under src/). That type was written for the `/api/v1` routes
 * mentioned as dead code in docs/self-hosting-audit.md §1 and has no live
 * producer. The query below reads whatever exists without assuming that
 * vocabulary is enforced.
 *
 * Capped at 50 with no pagination, matching this codebase's other list pages
 * (roadmap/memory order by created_at and render the full set; there is no
 * existing "load more" precedent to follow, and 50 is enough for a v1 log).
 */
export async function getRecentActivity(
  projectId: string,
  limit = 50
): Promise<ActivityLogRow[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("activity_logs")
    .select("id, project_id, organization_id, user_id, action, entity_type, entity_id, details, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []) as ActivityLogRow[];
}

export type { ActivityAction };
