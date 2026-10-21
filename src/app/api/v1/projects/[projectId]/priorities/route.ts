import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest, isGuardError } from "@/lib/api/route-guard";
import { apiDataClient } from "@/lib/api/api-data-client";
import { isValidUuid, invalidIdResponse } from "@/lib/api/validate-id";
import { getWorkflowOverrides } from "@/lib/data/workflow";
import { resolvePriorities } from "@/lib/work/task-board";
import { apiRoute } from "@/lib/api/api-route";

/**
 * The project's task priorities, most important first (migration 060):
 * the built-in low/medium/high/critical with any saved label/colour/order,
 * plus the project's own. `key` is what tasks carry in `priority`; hidden
 * ones are left out. `tasks:read`-gated, 404 for a project the key can't see.
 */
async function handleGET(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const guard = await guardApiRequest(request, "tasks:read");
  if (isGuardError(guard)) return guard;

  const { projectId } = await params;
  if (!isValidUuid(projectId)) return invalidIdResponse("projectId");

  const db = apiDataClient(guard.userId);
  const { data: project, error } = await db.from("projects").select("id").eq("id", projectId).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const workflow = await getWorkflowOverrides(guard.userId, projectId, db);
  const priorities = resolvePriorities(workflow.priorities).map(({ key, label, color, custom }) => ({ key, label, color, custom }));
  return NextResponse.json({ priorities });
}

export const GET = apiRoute(handleGET);
