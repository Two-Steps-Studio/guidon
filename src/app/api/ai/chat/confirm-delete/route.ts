import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/data/current-user";
import { deleteTask } from "@/app/projects/[id]/work/actions";

/**
 * The only place a task the AI chat proposed deleting actually gets
 * deleted - propose_delete_task (chat-tools.ts) never calls deleteTask
 * itself. No AI call happens here at all; this is a plain confirm click.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const projectId = typeof body?.projectId === "string" ? body.projectId : null;
  const taskId = typeof body?.taskId === "string" ? body.taskId : null;
  if (!projectId || !taskId) {
    return NextResponse.json({ error: "projectId and taskId are required" }, { status: 400 });
  }

  try {
    const result = await deleteTask(projectId, taskId);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[AI Chat Confirm Delete Error]:", error);
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
