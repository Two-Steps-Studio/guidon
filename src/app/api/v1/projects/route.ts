import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest, isGuardError } from "@/lib/api/route-guard";
import { getApiUserClient } from "@/lib/api/api-key-auth";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { PROJECT_LIST_SAFETY_CAP } from "@/lib/limits";
import { parseLimit } from "@/lib/api/api-route-core";
import { apiRoute } from "@/lib/api/api-route";

/**
 * Lists the projects this API key's user is a member of - added so an
 * external client (e.g. the Unity/UE5 editor plugins) can offer a project
 * picker instead of forcing a pasted project UUID. `tasks:read`-gated like
 * the tasks list route: this is a read, and every consumer of this route
 * already needs that scope to do anything useful with the result.
 *
 * No WHERE clause needed on either branch - same pattern as
 * src/app/projects/(list)/page.tsx's direct-DB query: RLS (projects_select,
 * private.is_org_member) already filters to exactly the caller's visible
 * projects via withUser()/getApiUserClient()'s scoped identity. A key bound
 * to one project (migration 054) lists only that project.
 */
async function handleGET(request: NextRequest) {
  const guard = await guardApiRequest(request, "tasks:read", { narrowsToKeyProject: true });
  if (isGuardError(guard)) return guard;

  // ?limit= (1-1000), alphabetical; the safety cap is also the default.
  const limit = parseLimit(request.nextUrl.searchParams.get("limit"), PROJECT_LIST_SAFETY_CAP, PROJECT_LIST_SAFETY_CAP);

  if (hasDirectDatabase()) {
    const result = await withUser(guard.userId, ({ query }) =>
      query(
        `SELECT id, name, organization_id FROM projects WHERE ($2::uuid IS NULL OR id = $2) ORDER BY name ASC LIMIT $1`,
        [limit, guard.projectId]
      )
    );
    return NextResponse.json({ projects: result.rows });
  }

  const supabase = await getApiUserClient(guard.userId);
  let query = supabase.from("projects").select("id, name, organization_id");
  if (guard.projectId) query = query.eq("id", guard.projectId);
  const { data, error } = await query.order("name", { ascending: true }).limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ projects: data ?? [] });
}

export const GET = apiRoute(handleGET);
