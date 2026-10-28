import "server-only";

import { NextRequest, NextResponse } from "next/server";
import type { z } from "zod";
import { guardApiRequest, isGuardError } from "@/lib/api/route-guard";
import { apiDataClient } from "@/lib/api/api-data-client";
import { isValidUuid, invalidIdResponse } from "@/lib/api/validate-id";
import type { DataClient } from "@/lib/data-client";
import { CREATE_DEFAULTS, projectResource, type ProjectResource } from "@/lib/api/project-resources";
import { apiRoute } from "@/lib/api/api-route";
import { agentGate } from "@/lib/api/agent-gate";

/**
 * The project resources in project-resources.ts - decisions, knowledge,
 * roadmap, memory, tech stack - implemented once:
 * - resourceOps(): the operations on any RLS-scoped data client, used by the
 *   in-app AI assistant (lib/ai/chat-tools.ts, browser session) as well as
 * - collectionRoutes()/itemRoutes(): the /api/v1 handlers (API key), which
 *   the MCP tools call in turn.
 *
 * Reads need `project:read`, writes `project:write`; both accept a key bound
 * to this project (migration 054). Every mutation is scoped by id AND
 * project_id and checks that a row actually came back - RLS silently
 * skipping a write (a viewer, another project's id) is reported as 404/403
 * instead of a success that never happened (CLAUDE.md).
 */

type Row = Record<string, unknown> & { id: string };

export interface OpResult {
  status: number;
  body: Record<string, unknown>;
}

const LIST_LIMIT = 500;
const RLS_DENIED = "42501";

const fail = (status: number, error: string): OpResult => ({ status, body: { error } });

function badInput(error: z.ZodError): OpResult {
  return fail(
    400,
    error.issues.map((issue) => (issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message)).join("; ")
  );
}

function dbError(error: { message: string; code?: string }): OpResult {
  return error.code === RLS_DENIED ? fail(403, "Your role in this project can't make this change.") : fail(400, error.message);
}

/** The row as answered - numeric columns as numbers in both modes (ProjectResource.numeric). */
function present(resource: ProjectResource, row: Row): Row {
  if (!resource.numeric) return row;
  const out: Row = { ...row };
  for (const column of resource.numeric) {
    if (typeof out[column] === "string") out[column] = Number(out[column]);
  }
  return out;
}

/**
 * The operations for one resource in one project, as `userId` through `db`
 * (which must be RLS-scoped to that user). `via` tags the activity entries.
 */
export function resourceOps(resource: ProjectResource, db: DataClient, userId: string, projectId: string, via: string) {
  const notFound = () => fail(404, `${resource.noun.replace(/_/g, " ")} not found in this project.`);

  async function log(action: "created" | "updated", row: Row) {
    const activity = resource.activity;
    const name = activity?.[action];
    if (!activity || !name) return;
    // Best effort, like the app's own logActivity: a failed log never fails the write.
    try {
      await db.from("activity_logs").insert({
        project_id: projectId,
        user_id: userId,
        action: name,
        entity_type: activity.entityType,
        entity_id: row.id,
        details: { title: activity.title(row), via },
      });
    } catch {
      // ignored - see above
    }
  }

  return {
    async list(): Promise<OpResult> {
      let query = db.from<Row>(resource.table).select("*").eq("project_id", projectId);
      for (const { column, ascending } of resource.order) query = query.order(column, { ascending });
      const { data, error } = await query.limit(LIST_LIMIT);
      if (error) return dbError(error);
      return { status: 200, body: { [resource.listKey]: data.map((row) => present(resource, row)) } };
    },

    async get(id: string): Promise<OpResult> {
      const { data, error } = await db.from<Row>(resource.table).select("*").eq("id", id).eq("project_id", projectId).maybeSingle();
      if (error) return dbError(error);
      if (!data) return notFound();
      return { status: 200, body: { [resource.itemKey]: present(resource, data) } };
    },

    async create(input: unknown): Promise<OpResult> {
      const parsed = resource.create.safeParse(input);
      if (!parsed.success) return badInput(parsed.error);
      const { data, error } = await db
        .from<Row>(resource.table)
        .insert({ ...CREATE_DEFAULTS[resource.table], ...parsed.data, project_id: projectId, ...resource.onCreate?.(userId) })
        .select("*")
        .single();
      if (error || !data) return dbError(error ?? { message: `Could not create the ${resource.noun}.` });
      await log("created", data);
      return { status: 201, body: { [resource.itemKey]: present(resource, data) } };
    },

    async update(id: string, input: unknown): Promise<OpResult> {
      const parsed = resource.update.safeParse(input);
      if (!parsed.success) return badInput(parsed.error);
      const changes = Object.fromEntries(Object.entries(parsed.data).filter(([, value]) => value !== undefined));
      if (Object.keys(changes).length === 0) return fail(400, "Nothing to change - send at least one field.");
      // updated_at is kept by each table's own trigger (and isn't in the
      // column UPDATE grants, migration 017).
      const { data, error } = await db
        .from<Row>(resource.table)
        .update(changes)
        .eq("id", id)
        .eq("project_id", projectId)
        .select("*");
      if (error) return dbError(error);
      // No row: wrong id/project, or RLS let the caller see but not change it.
      if (!data.length) return notFound();
      await log("updated", data[0]);
      return { status: 200, body: { [resource.itemKey]: present(resource, data[0]) } };
    },

    async remove(id: string): Promise<OpResult> {
      const { data, error } = await db.from<Row>(resource.table).delete().eq("id", id).eq("project_id", projectId).select("id");
      if (error) return dbError(error);
      if (!data.length) return notFound();
      return { status: 200, body: { ok: true } };
    },
  };
}

// ---------------------------------------------------------------- HTTP

type Params = { params: Promise<{ projectId: string; itemId?: string }> };

const respond = (result: OpResult) => NextResponse.json(result.body, { status: result.status });

async function open(request: NextRequest, params: Params["params"], scope: "project:read" | "project:write", path: string) {
  const { projectId, itemId } = await params;
  if (!isValidUuid(projectId)) return { ok: false, response: invalidIdResponse("projectId") } as const;
  if (itemId !== undefined && !isValidUuid(itemId)) return { ok: false, response: invalidIdResponse("id") } as const;

  const guard = await guardApiRequest(request, scope, { projectId });
  if (isGuardError(guard)) return { ok: false, response: guard } as const;

  const db = apiDataClient(guard.userId);
  const { data: project, error } = await db.from("projects").select("id").eq("id", projectId).maybeSingle();
  if (error) return { ok: false, response: respond(dbError(error)) } as const;
  if (!project) return { ok: false, response: NextResponse.json({ error: "Project not found." }, { status: 404 }) } as const;
  // Decisions, knowledge, memory, roadmap and tech stack are the project's
  // context: reading them is what Settings -> AI Permissions calls "Read
  // project context".
  if (scope === "project:read") {
    const blocked = await agentGate(db, guard, projectId, "can_read_context");
    if (blocked) return { ok: false, response: blocked } as const;
  }
  return { ok: true, ops: resourceOps(projectResource(path), db, guard.userId, projectId, "api"), itemId: itemId! } as const;
}

/** GET (list) and POST (create) for /api/v1/projects/{projectId}/<path>. */
export function collectionRoutes(path: string) {
  projectResource(path);

  async function GET(request: NextRequest, { params }: Params): Promise<Response> {
    const ctx = await open(request, params, "project:read", path);
    return ctx.ok ? respond(await ctx.ops.list()) : ctx.response;
  }

  async function POST(request: NextRequest, { params }: Params): Promise<Response> {
    const ctx = await open(request, params, "project:write", path);
    return ctx.ok ? respond(await ctx.ops.create(await request.json().catch(() => null))) : ctx.response;
  }

  return { GET: apiRoute(GET), POST: apiRoute(POST) };
}

/** GET, PATCH and DELETE for /api/v1/projects/{projectId}/<path>/{itemId}. */
export function itemRoutes(path: string) {
  projectResource(path);

  async function GET(request: NextRequest, { params }: Params): Promise<Response> {
    const ctx = await open(request, params, "project:read", path);
    return ctx.ok ? respond(await ctx.ops.get(ctx.itemId)) : ctx.response;
  }

  async function PATCH(request: NextRequest, { params }: Params): Promise<Response> {
    const ctx = await open(request, params, "project:write", path);
    return ctx.ok ? respond(await ctx.ops.update(ctx.itemId, await request.json().catch(() => null))) : ctx.response;
  }

  async function DELETE(request: NextRequest, { params }: Params): Promise<Response> {
    const ctx = await open(request, params, "project:write", path);
    return ctx.ok ? respond(await ctx.ops.remove(ctx.itemId)) : ctx.response;
  }

  return { GET: apiRoute(GET), PATCH: apiRoute(PATCH), DELETE: apiRoute(DELETE) };
}
