import { NextRequest, NextResponse } from "next/server";
import { apiRoute } from "@/lib/api/api-route";
import { authenticateApiKey } from "@/lib/api/api-key-auth";
import { matchBatchRoute, parseBatch, type BatchMethod } from "@/lib/api/batch-core";
import { collectionRoutes, itemRoutes } from "@/lib/api/project-resource-routes";
import { PROJECT_RESOURCES } from "@/lib/api/project-resources";
import { bearerChallenge } from "@/lib/oauth/oauth-core";
import { SITE_URL } from "@/lib/site-url";
import { GET as listProjects } from "@/app/api/v1/projects/route";
import { GET as listTasks, POST as createTask } from "@/app/api/v1/projects/[projectId]/tasks/route";
import { GET as listColumns } from "@/app/api/v1/projects/[projectId]/columns/route";
import { GET as listPriorities } from "@/app/api/v1/projects/[projectId]/priorities/route";
import { GET as getTask, PATCH as updateTask, DELETE as deleteTask } from "@/app/api/v1/tasks/[taskId]/route";
import { GET as getTaskContext } from "@/app/api/v1/tasks/[taskId]/context/route";
import { POST as startTask } from "@/app/api/v1/tasks/[taskId]/start/route";
import { PATCH as setTaskStatus } from "@/app/api/v1/tasks/[taskId]/status/route";
import { POST as completeTask } from "@/app/api/v1/tasks/[taskId]/complete/route";
import { GET as listComments, POST as commentOnTask } from "@/app/api/v1/tasks/[taskId]/comment/route";
import { GET as listAttempts, POST as recordAttempt } from "@/app/api/v1/tasks/[taskId]/attempts/route";

type RouteHandler = (request: NextRequest, context: { params: Promise<Record<string, string>> }) => Promise<Response>;
type MethodTable = Partial<Record<BatchMethod, RouteHandler>>;

const as = (handler: unknown) => handler as RouteHandler;

const TABLES: Record<string, MethodTable> = {
  projects: { GET: as(listProjects) },
  projectTasks: { GET: as(listTasks), POST: as(createTask) },
  projectColumns: { GET: as(listColumns) },
  projectPriorities: { GET: as(listPriorities) },
  task: { GET: as(getTask), PATCH: as(updateTask), DELETE: as(deleteTask) },
};

const TASK_ACTIONS: Record<string, MethodTable> = {
  context: { GET: as(getTaskContext) },
  start: { POST: as(startTask) },
  status: { PATCH: as(setTaskStatus) },
  complete: { POST: as(completeTask) },
  comment: { GET: as(listComments), POST: as(commentOnTask) },
  attempts: { GET: as(listAttempts), POST: as(recordAttempt) },
};

const RESOURCE_COLLECTIONS = Object.fromEntries(
  PROJECT_RESOURCES.map((resource) => [resource.path, collectionRoutes(resource.path) as unknown as MethodTable])
);
const RESOURCE_ITEMS = Object.fromEntries(
  PROJECT_RESOURCES.map((resource) => [resource.path, itemRoutes(resource.path) as unknown as MethodTable])
);

function handlerFor(key: string, params: Record<string, string>, method: BatchMethod): RouteHandler | undefined {
  if (key === "taskAction") return TASK_ACTIONS[params.action]?.[method];
  if (key === "projectResource") return RESOURCE_COLLECTIONS[params.resource]?.[method];
  if (key === "projectResourceItem") return RESOURCE_ITEMS[params.resource]?.[method];
  return TABLES[key]?.[method];
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  if (response.headers.get("content-type")?.includes("application/json")) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}

/**
 * POST /api/v1/batch: up to 20 operations in one request, run in order -
 * each through the same v1 route handler as a direct call (same scopes,
 * RLS, plan limits and rate limit: every operation counts), with the
 * caller's own key. Not a transaction: each operation succeeds or fails on
 * its own, and the response lists every result in order.
 */
async function handlePOST(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const identity = await authenticateApiKey(authorization);
  if (!identity || !authorization) {
    return NextResponse.json(
      { error: "Invalid or missing API key." },
      { status: 401, headers: { "WWW-Authenticate": bearerChallenge(SITE_URL, "/api/v1") } }
    );
  }

  const parsed = parseBatch(await request.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const origin = new URL(request.url).origin;
  const results: { status: number; body: unknown }[] = [];
  for (const operation of parsed.operations) {
    const route = matchBatchRoute(operation.path);
    const handler = route ? handlerFor(route.key, route.params, operation.method) : undefined;
    if (!route || !handler) {
      results.push({ status: 404, body: { error: `No ${operation.method} ${operation.path} in the API.`, code: "not_found" } });
      continue;
    }
    const headers = new Headers({ authorization });
    let body: string | undefined;
    if (operation.body !== undefined) {
      headers.set("content-type", "application/json");
      body = JSON.stringify(operation.body);
    }
    const url = new URL(`/api/v1${operation.path}`, origin);
    try {
      const response = await handler(new NextRequest(url, { method: operation.method, headers, body }), {
        params: Promise.resolve(route.params),
      });
      results.push({ status: response.status, body: await readBody(response) });
    } catch (error) {
      console.error(`[api/batch] ${operation.method} ${operation.path} threw:`, error);
      results.push({ status: 500, body: { error: "Internal error.", code: "internal_error" } });
    }
  }

  return NextResponse.json({ results });
}

export const POST = apiRoute(handlePOST);
