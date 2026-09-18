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
    // project_ai_permissions.can_create_comments is the app-level check
    // above, but the real gate is task_comments_insert's RLS policy (001),
    // which additionally requires the caller's *project role* to be one of
    // owner/admin/developer/tester - an API key issued to a project viewer
    // passes the app-level check (no row, or can_create_comments true) but
    // still gets rejected by RLS's WITH CHECK. Unlike UPDATE (which just
    // filters to 0 rows), a WITH CHECK violation on INSERT throws
    // (Postgres error 42501), so it needs its own catch here rather than a
    // rows-returned check.
    let result: unknown;
    try {
      result = await withUser(guard.userId, async ({ query }) => {
        const task = await query("SELECT project_id FROM tasks WHERE id = $1", [taskId]);
        if (task.rows.length === 0) return null;

        const perms = await query(
          "SELECT can_create_comments FROM project_ai_permissions WHERE project_id = $1",
          [task.rows[0].project_id]
        );
        if (perms.rows[0] && !perms.rows[0].can_create_comments) return "forbidden";

        const comment = await query(
          `INSERT INTO task_comments (task_id, author_id, content, actor_label) VALUES ($1, $2, $3, $4) RETURNING *`,
          [taskId, guard.userId, content, guard.botLabel]
        );
        await query(
          `INSERT INTO activity_logs (project_id, user_id, action, entity_type, entity_id, actor_label)
           VALUES ($1, $2, 'task_ai_commented', 'task', $3, $4)`,
          [task.rows[0].project_id, guard.userId, taskId, guard.botLabel]
        );
        return comment.rows[0];
      });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "42501") {
        return NextResponse.json({ error: "AI is not permitted to comment on this project." }, { status: 403 });
      }
      throw error;
    }

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
    .insert({ task_id: taskId, author_id: guard.userId, content, actor_label: guard.botLabel })
    .select()
    .single();

  if (error) {
    // Same RLS gate as the self-hosted branch above (task_comments_insert
    // requires project role owner/admin/developer/tester) - PostgREST
    // surfaces a WITH CHECK violation as a normal `error` object rather
    // than throwing, but it still needs mapping to 403 with a stable
    // message instead of leaking the raw Postgres error text at a
    // misleading 400.
    if (error.code === "42501") {
      return NextResponse.json({ error: "AI is not permitted to comment on this project." }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await supabase.from("activity_logs").insert({
    project_id: task.project_id,
    user_id: guard.userId,
    action: "task_ai_commented",
    entity_type: "task",
    entity_id: taskId,
    actor_label: guard.botLabel,
  });

  return NextResponse.json({ comment });
}
