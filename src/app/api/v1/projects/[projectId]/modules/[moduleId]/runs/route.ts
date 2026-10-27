import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest, isGuardError } from "@/lib/api/route-guard";
import { apiDataClient } from "@/lib/api/api-data-client";
import { isValidUuid, invalidIdResponse } from "@/lib/api/validate-id";
import { parseLimit } from "@/lib/api/api-route-core";
import { apiRoute } from "@/lib/api/api-route";

/**
 * The module's automation log (migration 094), newest first: which
 * automation ran for which record event, status, attempts and last error.
 * `project:read`; RLS shows it to project owners/admins only (others get an
 * empty list).
 */
async function handleGET(request: NextRequest, { params }: { params: Promise<{ projectId: string; moduleId: string }> }) {
  const { projectId, moduleId } = await params;
  if (!isValidUuid(projectId)) return invalidIdResponse("projectId");
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(moduleId)) return NextResponse.json({ error: "Invalid module id." }, { status: 400 });
  const guard = await guardApiRequest(request, "project:read", { projectId });
  if (isGuardError(guard)) return guard;
  const limit = parseLimit(new URL(request.url).searchParams.get("limit"), 50, 200);
  const { data, error } = await apiDataClient(guard.userId).from("module_automation_runs")
    .select("id, automation_id, record_id, event, status, attempts, last_error, next_attempt_at, created_at, updated_at")
    .eq("project_id", projectId).eq("module_id", moduleId).order("created_at", { ascending: false }).limit(limit);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ runs: data });
}

export const GET = apiRoute(handleGET);
