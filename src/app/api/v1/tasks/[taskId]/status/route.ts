import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest, isGuardError } from "@/lib/api/route-guard";
import { setTaskStatus } from "@/lib/api/task-transitions";
import type { TaskStatus } from "@/types/task";

const VALID_STATUSES: TaskStatus[] = ["backlog", "todo", "in_progress", "ai_working", "review", "done"];

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const guard = await guardApiRequest(request, "tasks:status");
  if (isGuardError(guard)) return guard;

  const body = await request.json().catch(() => null);
  const status = body?.status;

  if (typeof status !== "string" || !VALID_STATUSES.includes(status as TaskStatus)) {
    return NextResponse.json(
      { error: `status must be one of: ${VALID_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  const { taskId } = await params;
  const result = await setTaskStatus(guard.userId, taskId, status as TaskStatus);

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ task: result.task });
}
