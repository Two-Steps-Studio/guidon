import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest, isGuardError } from "@/lib/api/route-guard";
import { getApiUserClient } from "@/lib/api/api-key-auth";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { isValidUuid, invalidIdResponse } from "@/lib/api/validate-id";
import { buildTaskAgentContext } from "@/lib/context/agent-context-builder";

/**
 * Agent-context package for one task, as Markdown (Content-Type
 * text/markdown; errors stay JSON like every other /api/v1 route) - the same
 * document the "Copy agent context" button in the task dialog produces
 * (getTaskAgentContext, src/lib/context/agent-context.ts): task, project
 * constraints/facts/insights, related decisions/files/PRs/sources and
 * previous attempts.
 *
 * `tasks:read`-gated. The task's project is derived from the task row itself
 * (looked up under RLS as the key's owner), so a task the key's user cannot
 * see is a 404, and there is no way to pair a task with a foreign project id.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const guard = await guardApiRequest(request, "tasks:read");
  if (isGuardError(guard)) return guard;

  const { taskId } = await params;
  if (!isValidUuid(taskId)) return invalidIdResponse("taskId");

  let projectId: string;
  let getSupabase: Parameters<typeof buildTaskAgentContext>[3];

  if (hasDirectDatabase()) {
    const task = await withUser(guard.userId, ({ query }) =>
      query("SELECT project_id FROM tasks WHERE id = $1", [taskId])
    );
    if (task.rows.length === 0) return NextResponse.json({ error: "Task not found." }, { status: 404 });
    projectId = task.rows[0].project_id as string;
    // Never called in self-hosted mode (the builder branches on
    // hasDirectDatabase() itself); present only to satisfy the signature.
    getSupabase = () => getApiUserClient(guard.userId);
  } else {
    const supabase = await getApiUserClient(guard.userId);
    const { data: task } = await supabase.from("tasks").select("project_id").eq("id", taskId).maybeSingle();
    if (!task) return NextResponse.json({ error: "Task not found." }, { status: 404 });
    projectId = task.project_id as string;
    getSupabase = async () => supabase;
  }

  const context = await buildTaskAgentContext(guard.userId, projectId, taskId, getSupabase);
  if (context.error) {
    const status = context.error === "Task not found." ? 404 : 500;
    return NextResponse.json({ error: context.error }, { status });
  }

  return new NextResponse(context.markdown, {
    status: 200,
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
