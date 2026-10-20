import "server-only";

import { NextRequest, NextResponse } from "next/server";
import type { z } from "zod";
import { guardApiRequest, isGuardError } from "@/lib/api/route-guard";
import { apiDataClient } from "@/lib/api/api-data-client";
import { isValidUuid, invalidIdResponse } from "@/lib/api/validate-id";
import { CREATE_DEFAULTS, projectResource, type ProjectResource } from "@/lib/api/project-resources";

/**
 * Route handlers for the project resources in project-resources.ts - one
 * implementation for all of them, so decisions, knowledge, roadmap, memory
 * and the tech stack behave the same way over the API (and so over MCP).
 *
 * Reads need `project:read`, writes `project:write`; both accept a key bound
 * to this project (migration 054). Every mutation is scoped by id AND
 * project_id and checks that a row actually came back - RLS silently
 * skipping a write (a viewer's key, another project's id) is reported as
 * 404/403 instead of a success that never happened (CLAUDE.md).
 */

type Params = { params: Promise<{ projectId: string; itemId?: string }> };
type Row = Record<string, unknown> & { id: string };

const LIST_LIMIT = 500;
const RLS_DENIED = "42501";

function badBody(error: z.ZodError): NextResponse {
  const message = error.issues
    .map((issue) => (issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message))
    .join("; ");
  return NextResponse.json({ error: message }, { status: 400 });
}

function dbError(error: { message: string; code?: string }): NextResponse {
  if (error.code === RLS_DENIED) {
    return NextResponse.json({ error: "Your role in this project can't make this change." }, { status: 403 });
  }
  return NextResponse.json({ error: error.message }, { status: 400 });
}

async function resolve(request: NextRequest, params: Params["params"], scope: "project:read" | "project:write") {
  const { projectId, itemId } = await params;
  if (!isValidUuid(projectId)) return { ok: false, response: invalidIdResponse("projectId") } as const;
  if (itemId !== undefined && !isValidUuid(itemId)) return { ok: false, response: invalidIdResponse("id") } as const;

  const guard = await guardApiRequest(request, scope, { projectId });
  if (isGuardError(guard)) return { ok: false, response: guard } as const;

  const db = apiDataClient(guard.userId);
  const { data: project, error } = await db.from("projects").select("id").eq("id", projectId).maybeSingle();
  if (error) return { ok: false, response: dbError(error) } as const;
  if (!project) return { ok: false, response: NextResponse.json({ error: "Project not found." }, { status: 404 }) } as const;
  return { ok: true, userId: guard.userId, db, projectId, itemId } as const;
}

async function logActivity(
  ctx: { db: ReturnType<typeof apiDataClient>; userId: string; projectId: string },
  resource: ProjectResource,
  action: "created" | "updated",
  row: Row
) {
  const activity = resource.activity;
  const name = activity?.[action];
  if (!activity || !name) return;
  // Best effort, like the app's own logActivity: a failed log never fails the write.
  try {
    await ctx.db.from("activity_logs").insert({
      project_id: ctx.projectId,
      user_id: ctx.userId,
      action: name,
      entity_type: activity.entityType,
      entity_id: row.id,
      details: { title: activity.title(row), via: "api" },
    });
  } catch {
    // ignored - see above
  }
}

/** The row as the API answers it - see ProjectResource.numeric. */
function present(resource: ProjectResource, row: Row): Row {
  if (!resource.numeric) return row;
  const out: Row = { ...row };
  for (const column of resource.numeric) {
    if (typeof out[column] === "string") out[column] = Number(out[column]);
  }
  return out;
}

function notFound(resource: ProjectResource) {
  return NextResponse.json({ error: `${resource.noun.replace(/_/g, " ")} not found in this project.` }, { status: 404 });
}

/** GET (list) and POST (create) for /api/v1/projects/{projectId}/<path>. */
export function collectionRoutes(path: string) {
  const resource = projectResource(path);

  async function GET(request: NextRequest, { params }: Params): Promise<Response> {
    const ctx = await resolve(request, params, "project:read");
    if (!ctx.ok) return ctx.response;

    let query = ctx.db.from<Row>(resource.table).select("*").eq("project_id", ctx.projectId);
    for (const { column, ascending } of resource.order) query = query.order(column, { ascending });
    const { data, error } = await query.limit(LIST_LIMIT);
    if (error) return dbError(error);
    return NextResponse.json({ [resource.listKey]: data.map((row) => present(resource, row)) });
  }

  async function POST(request: NextRequest, { params }: Params): Promise<Response> {
    const ctx = await resolve(request, params, "project:write");
    if (!ctx.ok) return ctx.response;

    const parsed = resource.create.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return badBody(parsed.error);

    const { data, error } = await ctx.db
      .from<Row>(resource.table)
      .insert({
        ...CREATE_DEFAULTS[resource.table],
        ...parsed.data,
        project_id: ctx.projectId,
        ...resource.onCreate?.(ctx.userId),
      })
      .select("*")
      .single();
    if (error || !data) return dbError(error ?? { message: `Could not create the ${resource.noun}.` });

    await logActivity(ctx, resource, "created", data);
    return NextResponse.json({ [resource.itemKey]: present(resource, data) }, { status: 201 });
  }

  return { GET, POST };
}

/** GET, PATCH and DELETE for /api/v1/projects/{projectId}/<path>/{itemId}. */
export function itemRoutes(path: string) {
  const resource = projectResource(path);

  async function GET(request: NextRequest, { params }: Params): Promise<Response> {
    const ctx = await resolve(request, params, "project:read");
    if (!ctx.ok) return ctx.response;

    const { data, error } = await ctx.db
      .from<Row>(resource.table)
      .select("*")
      .eq("id", ctx.itemId!)
      .eq("project_id", ctx.projectId)
      .maybeSingle();
    if (error) return dbError(error);
    if (!data) return notFound(resource);
    return NextResponse.json({ [resource.itemKey]: present(resource, data) });
  }

  async function PATCH(request: NextRequest, { params }: Params): Promise<Response> {
    const ctx = await resolve(request, params, "project:write");
    if (!ctx.ok) return ctx.response;

    const parsed = resource.update.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return badBody(parsed.error);
    const changes = Object.fromEntries(Object.entries(parsed.data).filter(([, value]) => value !== undefined));
    if (Object.keys(changes).length === 0) {
      return NextResponse.json({ error: "Nothing to change - send at least one field." }, { status: 400 });
    }
    // updated_at is kept by each table's own trigger (and isn't in the
    // column UPDATE grants, migration 017).

    const { data, error } = await ctx.db
      .from<Row>(resource.table)
      .update(changes)
      .eq("id", ctx.itemId!)
      .eq("project_id", ctx.projectId)
      .select("*");
    if (error) return dbError(error);
    // No row: wrong id/project, or RLS let the caller see but not change it.
    if (!data.length) return notFound(resource);

    await logActivity(ctx, resource, "updated", data[0]);
    return NextResponse.json({ [resource.itemKey]: present(resource, data[0]) });
  }

  async function DELETE(request: NextRequest, { params }: Params): Promise<Response> {
    const ctx = await resolve(request, params, "project:write");
    if (!ctx.ok) return ctx.response;

    const { data, error } = await ctx.db
      .from<Row>(resource.table)
      .delete()
      .eq("id", ctx.itemId!)
      .eq("project_id", ctx.projectId)
      .select("id");
    if (error) return dbError(error);
    if (!data.length) return notFound(resource);
    return NextResponse.json({ ok: true });
  }

  return { GET, PATCH, DELETE };
}
