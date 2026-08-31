import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest, isGuardError } from "@/lib/api/route-guard";
import { getApiUserClient } from "@/lib/api/api-key-auth";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { isValidUuid, invalidIdResponse } from "@/lib/api/validate-id";

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

  if (hasDirectDatabase()) {
    const result = await withUser(guard.userId, async ({ query }) => {
      const task = await query("SELECT project_id FROM tasks WHERE id = $1", [taskId]);
      if (task.rows.length === 0) return null;

      const perms = await query(
        "SELECT can_create_comments FROM project_ai_permissions WHERE project_id = $1",
        [task.rows[0].project_id]
      );
      if (perms.rows[0] && !perms.rows[0].can_create_comments) return "forbidden";

      const comment = await query(
        `INSERT INTO task_comments (task_id, author_id, content) VALUES ($1, $2, $3) RETURNING *`,
        [taskId, guard.userId, content]
      );
      await query(
        `INSERT INTO activity_logs (project_id, user_id, action, entity_type, entity_id)
         VALUES ($1, $2, 'task_ai_commented', 'task', $3)`,
        [task.rows[0].project_id, guard.userId, taskId]
      );
      return comment.rows[0];
    });

    if (result === null) return NextResponse.json({ error: "Task not found." }, { status: 404 });
    if (result === "forbidden") {
      return NextResponse.json({ error: "AI is not permitted to comment on this project." }, { status: 403 });
    }
    return NextResponse.json({ comment: result });
  }

  const supabase = await getApiUserClient(guard.userId);

  const { data: task } = await supabase.from("tasks").select("project_id").eq("id", taskId).maybeSingle();
  if (!task) return NextResponse.json({ error: "Task not found." }, { status: 404 });

  const { data: perms } = await supabase
    .from("project_ai_permissions")
    .select("can_create_comments")
    .eq("project_id", task.project_id)
    .maybeSingle();

  if (perms && !perms.can_create_comments) {
    return NextResponse.json({ error: "AI is not permitted to comment on this project." }, { status: 403 });
  }

  const { data: comment, error } = await supabase
    .from("task_comments")
    .insert({ task_id: taskId, author_id: guard.userId, content })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await supabase
    .from("activity_logs")
    .insert({ project_id: task.project_id, user_id: guard.userId, action: "task_ai_commented", entity_type: "task", entity_id: taskId });

  return NextResponse.json({ comment });
}
