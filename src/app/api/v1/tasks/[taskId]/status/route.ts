import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest, isGuardError } from "@/lib/api/route-guard";
import { setTaskStatus } from "@/lib/api/task-transitions";
import { isValidUuid, invalidIdResponse } from "@/lib/api/validate-id";
import { WORKFLOW_KEY_RE } from "@/lib/work/task-board";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const guard = await guardApiRequest(request, "tasks:status");
  if (isGuardError(guard)) return guard;

  const body = await request.json().catch(() => null);
  const status = body?.status;

  // Any of the project's columns (GET /projects/{id}/columns) - built-in or
  // its own; the database rejects a key the project doesn't have.
  if (typeof status !== "string" || !WORKFLOW_KEY_RE.test(status)) {
    return NextResponse.json(
      { error: "status must be one of the project's column keys - see GET /projects/{projectId}/columns." },
      { status: 400 }
    );
  }

  const { taskId } = await params;
  if (!isValidUuid(taskId)) return invalidIdResponse("taskId");
  const result = await setTaskStatus(guard.userId, taskId, status, {
    botLabel: guard.botLabel,
    humanClient: guard.humanClient,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ task: result.task });
}
