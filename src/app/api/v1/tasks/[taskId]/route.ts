import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest, isGuardError } from "@/lib/api/route-guard";
import { getApiUserClient } from "@/lib/api/api-key-auth";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { isValidUuid, invalidIdResponse } from "@/lib/api/validate-id";
import { TASK_PRIORITIES } from "@/lib/work/task-board";
import type { TaskPriority } from "@/types/task";

export async function GET(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const guard = await guardApiRequest(request, "tasks:read");
  if (isGuardError(guard)) return guard;

  const { taskId } = await params;
  if (!isValidUuid(taskId)) return invalidIdResponse("taskId");

  if (hasDirectDatabase()) {
    const result = await withUser(guard.userId, ({ query }) =>
      query("SELECT * FROM tasks WHERE id = $1", [taskId])
    );
    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Task not found." }, { status: 404 });
    }
    return NextResponse.json({ task: result.rows[0] });
  }

  const supabase = await getApiUserClient(guard.userId);
  const { data, error } = await supabase.from("tasks").select("*").eq("id", taskId).maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Task not found." }, { status: 404 });
  return NextResponse.json({ task: data });
}

// title/description/priority/due_date/sort_order only - status stays on
// its own PATCH .../status route (separate `tasks:status` scope, unchanged
// by this list). sort_order is here specifically so the Unity plugin's
// drag-and-drop can commit a card's new position within a column through
// this same route rather than a dedicated one.
const PATCHABLE_COLUMNS = ["title", "description", "priority", "due_date", "sort_order"] as const;

function isValidTaskPriority(value: unknown): value is TaskPriority {
  return typeof value === "string" && (TASK_PRIORITIES as readonly string[]).includes(value);
}

/**
 * Edits a task's fields - mirrors updateTask in
 * src/app/projects/[id]/work/actions.ts, reimplemented here for the same
 * reason POST on the tasks-list route is (see that route's doc comment):
 * identity here comes from an API key, not a browser session.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const guard = await guardApiRequest(request, "tasks:write");
  if (isGuardError(guard)) return guard;

  const { taskId } = await params;
  if (!isValidUuid(taskId)) return invalidIdResponse("taskId");

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }

  const patch: Partial<Record<(typeof PATCHABLE_COLUMNS)[number], unknown>> = {};

  if ("title" in body) {
    if (typeof body.title !== "string" || !body.title.trim()) {
      return NextResponse.json({ error: "title, if provided, must be a non-empty string." }, { status: 400 });
    }
    patch.title = body.title.trim();
  }
  if ("description" in body) {
    patch.description = typeof body.description === "string" ? body.description.trim() || null : null;
  }
  if ("priority" in body) {
    if (!isValidTaskPriority(body.priority)) {
      return NextResponse.json(
        { error: `priority must be one of: ${TASK_PRIORITIES.join(", ")}` },
        { status: 400 }
      );
    }
    patch.priority = body.priority;
  }
  if ("due_date" in body) {
    patch.due_date =
      typeof body.due_date === "string" && body.due_date ? new Date(body.due_date).toISOString() : null;
  }
  if ("sort_order" in body) {
    if (typeof body.sort_order !== "number" || !Number.isFinite(body.sort_order)) {
      return NextResponse.json({ error: "sort_order must be a number." }, { status: 400 });
    }
    patch.sort_order = body.sort_order;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update - patch had no recognized fields." }, { status: 400 });
  }

  if (hasDirectDatabase()) {
    const existing = await withUser(guard.userId, ({ query }) =>
      query("SELECT 1 FROM tasks WHERE id = $1", [taskId])
    );
    if (existing.rows.length === 0) return NextResponse.json({ error: "Task not found." }, { status: 404 });

    const columns = PATCHABLE_COLUMNS.filter((column) => column in patch);
    const setClause = columns.map((column, i) => `${column} = $${i + 1}`).join(", ");
    const values = columns.map((column) => patch[column]);

    let result;
    try {
      result = await withUser(guard.userId, ({ query }) =>
        query(`UPDATE tasks SET ${setClause} WHERE id = $${values.length + 1} RETURNING *`, [
          ...values,
          taskId,
        ])
      );
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Failed to update task." },
        { status: 400 }
      );
    }

    if (result.rows.length === 0) {
      // tasks_select (broader - any project member) already proved this row
      // exists above; zero rows here means RLS's narrower tasks_update
      // policy (owner/admin/developer) rejected this caller - same
      // reasoning as task-transitions.ts's setStatusAndLog.
      return NextResponse.json(
        { error: "This API key's user does not have permission to update this task." },
        { status: 403 }
      );
    }

    await withUser(guard.userId, ({ query }) =>
      query(
        `INSERT INTO activity_logs (project_id, user_id, action, entity_type, entity_id)
         VALUES ($1, $2, 'task_updated', 'task', $3)`,
        [result.rows[0].project_id, guard.userId, taskId]
      )
    );

    return NextResponse.json({ task: result.rows[0] });
  }

  const supabase = await getApiUserClient(guard.userId);

  const { data: existing } = await supabase.from("tasks").select("id, project_id").eq("id", taskId).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Task not found." }, { status: 404 });

  const { data, error } = await supabase.from("tasks").update(patch).eq("id", taskId).select().single();

  if (error) {
    // Same RLS gate as the direct-DB branch above - .single() errors when
    // the UPDATE...RETURNING matched zero rows, which for a primary-key
    // lookup can only mean RLS filtered it out.
    if (error.code === "PGRST116") {
      return NextResponse.json(
        { error: "This API key's user does not have permission to update this task." },
        { status: 403 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await supabase.from("activity_logs").insert({
    project_id: existing.project_id,
    user_id: guard.userId,
    action: "task_updated",
    entity_type: "task",
    entity_id: taskId,
  });

  return NextResponse.json({ task: data });
}

/** Mirrors deleteTask in src/app/projects/[id]/work/actions.ts - see PATCH's doc comment for why this isn't a direct call into it. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const guard = await guardApiRequest(request, "tasks:write");
  if (isGuardError(guard)) return guard;

  const { taskId } = await params;
  if (!isValidUuid(taskId)) return invalidIdResponse("taskId");

  if (hasDirectDatabase()) {
    const existing = await withUser(guard.userId, ({ query }) =>
      query("SELECT project_id FROM tasks WHERE id = $1", [taskId])
    );
    if (existing.rows.length === 0) return NextResponse.json({ error: "Task not found." }, { status: 404 });

    let result;
    try {
      result = await withUser(guard.userId, ({ query }) =>
        query("DELETE FROM tasks WHERE id = $1 RETURNING id", [taskId])
      );
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Failed to delete task." },
        { status: 400 }
      );
    }

    if (result.rows.length === 0) {
      // tasks_delete (001) requires owner/admin - narrower than
      // tasks_select, same "prove existence, then let RLS gate the write"
      // shape as PATCH above.
      return NextResponse.json(
        { error: "This API key's user does not have permission to delete this task." },
        { status: 403 }
      );
    }

    await withUser(guard.userId, ({ query }) =>
      query(
        `INSERT INTO activity_logs (project_id, user_id, action, entity_type, entity_id)
         VALUES ($1, $2, 'task_deleted', 'task', $3)`,
        [existing.rows[0].project_id, guard.userId, taskId]
      )
    );

    return NextResponse.json({ ok: true });
  }

  const supabase = await getApiUserClient(guard.userId);

  const { data: existing } = await supabase.from("tasks").select("id, project_id").eq("id", taskId).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Task not found." }, { status: 404 });

  const { error, count } = await supabase.from("tasks").delete({ count: "exact" }).eq("id", taskId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!count) {
    return NextResponse.json(
      { error: "This API key's user does not have permission to delete this task." },
      { status: 403 }
    );
  }

  await supabase.from("activity_logs").insert({
    project_id: existing.project_id,
    user_id: guard.userId,
    action: "task_deleted",
    entity_type: "task",
    entity_id: taskId,
  });

  return NextResponse.json({ ok: true });
}
