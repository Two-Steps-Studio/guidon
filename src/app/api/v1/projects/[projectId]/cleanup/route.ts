import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest, isGuardError } from "@/lib/api/route-guard";
import { apiDataClient } from "@/lib/api/api-data-client";
import { isValidUuid, invalidIdResponse } from "@/lib/api/validate-id";
import { apiRoute } from "@/lib/api/api-route";
import { loadCleanupReport } from "@/lib/work/task-cleanup";

/**
 * A cleanup review of the project's tasks: likely duplicates (with the one
 * to keep), overdue, untouched for 60+ days, in progress with nobody
 * assigned - plus `summary`, the same as text an agent can act on.
 * Read-only: the agent changes tasks with the usual endpoints, after asking
 * the person. `tasks:read`-gated like the tasks list; a project the key's
 * user can't see is 404.
 */
async function handleGET(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const guard = await guardApiRequest(request, "tasks:read", { projectId: (await params).projectId });
  if (isGuardError(guard)) return guard;

  const { projectId } = await params;
  if (!isValidUuid(projectId)) return invalidIdResponse("projectId");

  const db = apiDataClient(guard.userId);
  const { data: project, error } = await db.from("projects").select("id").eq("id", projectId).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const result = await loadCleanupReport(db, projectId);
  if (result.error !== null) return NextResponse.json({ error: result.error }, { status: 400 });
  const { report } = result;
  return NextResponse.json({
    summary: result.text,
    reviewed: result.total,
    duplicates: report.duplicates,
    overdue: report.overdue,
    stale: report.stale,
    unassigned_in_progress: report.unassignedInProgress,
  });
}

export const GET = apiRoute(handleGET);
