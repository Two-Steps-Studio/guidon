import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest, isGuardError } from "@/lib/api/route-guard";
import { apiDataClient } from "@/lib/api/api-data-client";
import { isValidUuid, invalidIdResponse } from "@/lib/api/validate-id";
import { TASK_PRIORITIES } from "@/lib/work/task-board";
import type { TaskPriority } from "@/types/task";

export async function GET(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const guard = await guardApiRequest(request, "tasks:read");
  if (isGuardError(guard)) return guard;

  const { taskId } = await params;
  if (!isValidUuid(taskId)) return invalidIdResponse("taskId");

  const { data, error } = await apiDataClient(guard.userId).from("tasks").select("*").eq("id", taskId).maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Task not found." }, { status: 404 });
  return NextResponse.json({ task: data });
}

// title/description/priority/due_date/sort_order only - status stays on
// its own PATCH .../status route (separate `tasks:status` scope, unchanged
// by this list). sort_order is here specifically so the Unity plugin's
// drag-and-drop can commit a card's new position within a column through
// this same route rather than a dedicated one.
type PatchableColumn = "title" | "description" | "priority" | "due_date" | "sort_order";

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

  const patch: Partial<Record<PatchableColumn, unknown>> = {};

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

  const db = apiDataClient(guard.userId);

  const { data: existing } = await db
    .from<{ id: string; project_id: string }>("tasks")
    .select("id, project_id")
    .eq("id", taskId)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: "Task not found." }, { status: 404 });

  const { data, error } = await db.from("tasks").update(patch).eq("id", taskId).select("*").maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) {
    // tasks_select (any project member) already proved this row exists
    // above; zero rows here means RLS's narrower tasks_update policy
    // (owner/admin/developer) rejected this caller - same reasoning as
    // task-transitions.ts's setStatusAndLog.
    return NextResponse.json(
      { error: "This API key's user does not have permission to update this task." },
      { status: 403 }
    );
  }

  await db.from("activity_logs").insert({
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

  const db = apiDataClient(guard.userId);

  const { data: existing } = await db
    .from<{ project_id: string }>("tasks")
    .select("project_id")
    .eq("id", taskId)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: "Task not found." }, { status: 404 });

  const { data: deleted, error } = await db.from("tasks").delete().eq("id", taskId).select("id");

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (deleted.length === 0) {
    // tasks_delete (001) requires owner/admin - narrower than tasks_select,
    // same "prove existence, then let RLS gate the write" shape as PATCH.
    return NextResponse.json(
      { error: "This API key's user does not have permission to delete this task." },
      { status: 403 }
    );
  }

  await db.from("activity_logs").insert({
    project_id: existing.project_id,
    user_id: guard.userId,
    action: "task_deleted",
    entity_type: "task",
    entity_id: taskId,
  });

  return NextResponse.json({ ok: true });
}
