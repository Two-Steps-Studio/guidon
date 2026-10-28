import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest, isGuardError } from "@/lib/api/route-guard";
import { apiDataClient } from "@/lib/api/api-data-client";
import { isValidUuid, invalidIdResponse } from "@/lib/api/validate-id";
import { apiRoute } from "@/lib/api/api-route";
import { listTaskLinks } from "@/lib/data/task-links";
import { agentGate } from "@/lib/api/agent-gate";

/**
 * Commits, branches and PRs linked to a task (Smart Linking, migration 097):
 * confirmed links (an explicit guidon#ref, or reviewed), suggestions waiting
 * for review (confidence < 1, with the evidence) and rejected ones. Each has
 * its provenance and timestamps. `tasks:read`; a task the key's user can't
 * see is a 404.
 */
async function handleGET(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const guard = await guardApiRequest(request, "tasks:read");
  if (isGuardError(guard)) return guard;
  const { taskId } = await params;
  if (!isValidUuid(taskId)) return invalidIdResponse("taskId");
  const db = apiDataClient(guard.userId);
  const { data: task } = await db.from<{ project_id: string }>("tasks").select("project_id").eq("id", taskId).maybeSingle();
  if (!task) return NextResponse.json({ error: "Task not found." }, { status: 404 });
  const blocked = await agentGate(db, guard, task.project_id, "can_read_context");
  if (blocked) return blocked;
  const result = await listTaskLinks(db, task.project_id, taskId);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ links: result.links });
}

export const GET = apiRoute(handleGET);
