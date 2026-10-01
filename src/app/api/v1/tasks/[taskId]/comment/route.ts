import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest, isGuardError } from "@/lib/api/route-guard";
import { apiDataClient } from "@/lib/api/api-data-client";
import { isPermissionDenied } from "@/lib/db/errors";
import { isValidUuid, invalidIdResponse } from "@/lib/api/validate-id";

const COMMENT_COLUMNS = "id, task_id, author_id, content, created_at, actor_label";
const AI_DISABLED_ERROR = "AI features are turned off for this project.";
const AI_NOT_PERMITTED_ERROR = "AI is not permitted to comment on this project.";

/**
 * Lists a task's comments - `tasks:read`-gated (a read), separate from
 * `comments:write` below which only covers posting a new one. Added for
 * the Unity/UE5 editor plugins, which otherwise had no way to show the
 * existing comment thread, only add to it blindly. Column set matches
 * loadComments in src/app/projects/[id]/work/actions.ts.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const guard = await guardApiRequest(request, "tasks:read");
  if (isGuardError(guard)) return guard;

  const { taskId } = await params;
  if (!isValidUuid(taskId)) return invalidIdResponse("taskId");

  const db = apiDataClient(guard.userId);

  const { data: task } = await db.from("tasks").select("id").eq("id", taskId).maybeSingle();
  if (!task) return NextResponse.json({ error: "Task not found." }, { status: 404 });

  const { data, error } = await db
    .from("task_comments")
    .select(COMMENT_COLUMNS)
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ comments: data });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const guard = await guardApiRequest(request, "comments:write");
  if (isGuardError(guard)) return guard;

  const body = await request.json().catch(() => null);
  const content = typeof body?.content === "string" ? body.content.trim() : "";

  if (!content) {
    return NextResponse.json({ error: "content is required." }, { status: 400 });
  }

  const { taskId } = await params;
  if (!isValidUuid(taskId)) return invalidIdResponse("taskId");

  const db = apiDataClient(guard.userId);

  const { data: task } = await db
    .from<{ project_id: string }>("tasks")
    .select("project_id")
    .eq("id", taskId)
    .maybeSingle();
  if (!task) return NextResponse.json({ error: "Task not found." }, { status: 404 });

  // Agent keys (not human_client, migration 039) are gated by the project's
  // AI switch (046) and its AI permissions; human clients are not.
  if (!guard.humanClient) {
    const [{ data: project }, { data: perms }] = await Promise.all([
      db.from<{ ai_enabled: boolean }>("projects").select("ai_enabled").eq("id", task.project_id).maybeSingle(),
      db
        .from<{ can_create_comments: boolean }>("project_ai_permissions")
        .select("can_create_comments")
        .eq("project_id", task.project_id)
        .maybeSingle(),
    ]);
    if (project && !project.ai_enabled) {
      return NextResponse.json({ error: AI_DISABLED_ERROR }, { status: 403 });
    }
    if (perms && !perms.can_create_comments) {
      return NextResponse.json({ error: AI_NOT_PERMITTED_ERROR }, { status: 403 });
    }
  }

  const { data: comment, error } = await db
    .from("task_comments")
    .insert({ task_id: taskId, author_id: guard.userId, content, actor_label: guard.botLabel })
    .select("*")
    .single();

  if (error) {
    // The permissions check above is app-level; the real gate is
    // task_comments_insert's RLS (001), which also requires the caller's
    // project role to be owner/admin/developer/tester - a key issued to a
    // project viewer passes the check above but fails RLS's WITH CHECK
    // (SQLSTATE 42501). Map it to a stable 403 instead of leaking the raw
    // Postgres text at a misleading 400.
    if (isPermissionDenied(error)) {
      return NextResponse.json({ error: AI_NOT_PERMITTED_ERROR }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await db.from("activity_logs").insert({
    project_id: task.project_id,
    user_id: guard.userId,
    action: "task_ai_commented",
    entity_type: "task",
    entity_id: taskId,
    actor_label: guard.botLabel,
  });

  return NextResponse.json({ comment });
}
