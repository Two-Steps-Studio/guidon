import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest, isGuardError } from "@/lib/api/route-guard";
import { getApiUserClient } from "@/lib/api/api-key-auth";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { isValidUuid, invalidIdResponse } from "@/lib/api/validate-id";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/work/task-board";
import { getOrgPlanLimits, isTaskLimitReached } from "@/lib/limits";
import type { TaskPriority, TaskStatus } from "@/types/task";

export async function GET(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const guard = await guardApiRequest(request, "tasks:read");
  if (isGuardError(guard)) return guard;

  const { projectId } = await params;
  if (!isValidUuid(projectId)) return invalidIdResponse("projectId");

  // Safety cap, not pagination - this endpoint has no cursor/page param yet;
  // matches the cap applied to the human-facing task board
  // (src/app/projects/[id]/work/page.tsx).
  const TASK_LIMIT = 1000;

  // A project the caller isn't a member of is invisible under RLS the same
  // way its tasks are - without checking this separately, "wrong/foreign
  // project id" and "a real, empty project" were both just `{ tasks: [] }`,
  // contradicting the documented contract (design doc: "a project they're
  // not a member of returns 404, not empty").
  if (hasDirectDatabase()) {
    const projectExists = await withUser(guard.userId, ({ query }) =>
      query("SELECT 1 FROM projects WHERE id = $1", [projectId])
    );
    if (projectExists.rows.length === 0) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    const result = await withUser(guard.userId, ({ query }) =>
      query("SELECT * FROM tasks WHERE project_id = $1 ORDER BY created_at DESC LIMIT $2", [
        projectId,
        TASK_LIMIT,
      ])
    );
    return NextResponse.json({ tasks: result.rows });
  }

  const supabase = await getApiUserClient(guard.userId);

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle();
  if (projectError) return NextResponse.json({ error: projectError.message }, { status: 400 });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(TASK_LIMIT);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ tasks: data ?? [] });
}

/**
 * Creates a task - or a subtask when `parent_task_id` is given, mirroring
 * createTask/createSubtask in
 * src/app/projects/[id]/work/actions.ts, reimplemented here (not called
 * directly) because those Server Actions resolve identity through
 * getProjectAccess()'s browser session/cookie, which doesn't exist for a
 * Bearer-key request - every route in this API keeps its own
 * withUser(guard.userId, ...) / getApiUserClient(guard.userId) logic for
 * exactly that reason (see task-transitions.ts).
 *
 * `tasks:write`-gated - a read, PATCH .../status, and POST .../comment
 * already had their own narrower scopes; this covers the rest of task
 * mutation (create/update/delete).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const guard = await guardApiRequest(request, "tasks:write");
  if (isGuardError(guard)) return guard;

  const { projectId } = await params;
  if (!isValidUuid(projectId)) return invalidIdResponse("projectId");

  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) return NextResponse.json({ error: "title is required." }, { status: 400 });

  const description = typeof body?.description === "string" ? body.description.trim() || null : null;
  const requestedPriority =
    typeof body?.priority === "string" && (TASK_PRIORITIES as readonly string[]).includes(body.priority)
      ? (body.priority as TaskPriority)
      : "medium";
  const dueDate =
    typeof body?.due_date === "string" && body.due_date ? new Date(body.due_date).toISOString() : null;
  // An empty string is treated the same as "not provided" - some clients
  // (Unity's JsonUtility, notably) can't serialize an actual JSON `null`
  // for an unset string field and send "" instead, which must not be
  // mistaken for "this is a subtask".
  const parentTaskId =
    typeof body?.parent_task_id === "string" && body.parent_task_id.trim() ? body.parent_task_id.trim() : null;
  if (parentTaskId && !isValidUuid(parentTaskId)) return invalidIdResponse("parent_task_id");

  // A subtask always starts todo/medium and is never counted against the
  // plan's task limit - matches createSubtask exactly, which never took a
  // status/priority input at all. A top-level task defaults to backlog but
  // may specify any column directly (matches createTask, which the web
  // board's per-column "+" button already relies on to create straight
  // into the clicked column rather than always landing in Backlog).
  const requestedStatus =
    typeof body?.status === "string" && (TASK_STATUSES as readonly string[]).includes(body.status)
      ? (body.status as TaskStatus)
      : "backlog";
  const isSubtask = parentTaskId !== null;
  const status: TaskStatus = isSubtask ? "todo" : requestedStatus;
  const priority: TaskPriority = isSubtask ? "medium" : requestedPriority;

  if (hasDirectDatabase()) {
    const project = await withUser(guard.userId, ({ query }) =>
      query("SELECT organization_id FROM projects WHERE id = $1", [projectId])
    );
    if (project.rows.length === 0) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    if (parentTaskId) {
      const parent = await withUser(guard.userId, ({ query }) =>
        query("SELECT 1 FROM tasks WHERE id = $1 AND project_id = $2", [parentTaskId, projectId])
      );
      if (parent.rows.length === 0) {
        return NextResponse.json({ error: "parent_task_id not found in this project." }, { status: 400 });
      }
    }

    let createdRow: Record<string, unknown>;
    try {
      const result = await withUser(guard.userId, ({ query }) =>
        query(
          `INSERT INTO tasks (project_id, parent_task_id, title, description, status, priority, due_date, tags, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING *`,
          [projectId, parentTaskId, title, description, status, priority, dueDate, [], guard.userId]
        )
      );
      createdRow = result.rows[0];
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Failed to create task." },
        { status: 400 }
      );
    }

    await withUser(guard.userId, ({ query }) =>
      query(
        `INSERT INTO activity_logs (project_id, user_id, action, entity_type, entity_id)
         VALUES ($1, $2, 'task_created', 'task', $3)`,
        [projectId, guard.userId, createdRow.id]
      )
    );

    return NextResponse.json({ task: createdRow });
  }

  const supabase = await getApiUserClient(guard.userId);

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, organization_id")
    .eq("id", projectId)
    .maybeSingle();
  if (projectError) return NextResponse.json({ error: projectError.message }, { status: 400 });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  if (parentTaskId) {
    const { data: parent } = await supabase
      .from("tasks")
      .select("id")
      .eq("id", parentTaskId)
      .eq("project_id", projectId)
      .maybeSingle();
    if (!parent) {
      return NextResponse.json({ error: "parent_task_id not found in this project." }, { status: 400 });
    }
  } else {
    // Plan task limit - hosted-only, mirrors createTask's own asymmetry
    // exactly (self-hosted has never had this limit; subtasks never count
    // against it either way).
    const { planName, taskLimitPerProject } = await getOrgPlanLimits(project.organization_id);
    const { count } = await supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .is("parent_task_id", null);

    if (isTaskLimitReached(count ?? 0, taskLimitPerProject)) {
      return NextResponse.json(
        {
          error: `You've reached your ${planName} plan's limit of ${taskLimitPerProject} tasks per project. Upgrade your plan to raise this limit.`,
        },
        { status: 403 }
      );
    }
  }

  const { data: created, error } = await supabase
    .from("tasks")
    .insert({
      project_id: projectId,
      parent_task_id: parentTaskId,
      title,
      description,
      status,
      priority,
      due_date: dueDate,
      tags: [],
      created_by: guard.userId,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await supabase.from("activity_logs").insert({
    project_id: projectId,
    user_id: guard.userId,
    action: "task_created",
    entity_type: "task",
    entity_id: created.id,
  });

  return NextResponse.json({ task: created });
}
