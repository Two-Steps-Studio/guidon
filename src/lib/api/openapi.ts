import { z } from "zod";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/work/task-board";

const statusSchema = {
  type: "string",
  pattern: "^[a-z][a-z0-9_]{0,39}$",
  description: `A column key of the task's project (GET /projects/{projectId}/columns). Built-in: ${TASK_STATUSES.join(", ")}.`,
};
const prioritySchema = {
  type: "string",
  pattern: "^[a-z][a-z0-9_]{0,39}$",
  description: `A priority key of the task's project (GET /projects/{projectId}/priorities). Built-in: ${TASK_PRIORITIES.join(", ")}.`,
};
import { REPORT_CATEGORIES, REPORT_SOURCES } from "@/lib/api/game-report";
import {
  commentFields,
  createTaskFields,
  recordAttemptFields,
  setStatusFields,
  updateTaskFields,
} from "@/lib/api/v1-schemas";
import { PROJECT_RESOURCES } from "@/lib/api/project-resources";

/**
 * OpenAPI 3.1 description of /api/v1 (served at /openapi.json, listed in
 * /.well-known/api-catalog). Request bodies are generated from the same zod
 * shapes the MCP tools use (v1-schemas.ts); the route files remain the source
 * of truth for behaviour. GET /api/v1/search is left out on purpose: it uses
 * the browser session, not an API key.
 */

type JsonSchema = Record<string, unknown>;

/** JSON Schema for a request body built from a zod field map. */
function body(fields: z.ZodRawShape, required?: string[]): JsonSchema {
  const schema = z.toJSONSchema(z.object(fields), { target: "draft-2020-12" }) as JsonSchema;
  delete schema.$schema;
  if (required) schema.required = required;
  return schema;
}

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: JsonSchema) => ({ "application/json": { schema } });
const ok = (description: string, schema: JsonSchema, status = "200") => ({
  [status]: { description, content: json(schema) },
});
const wrap = (key: string, schema: JsonSchema) => ({ type: "object", properties: { [key]: schema }, required: [key] });



/** Sent on every response of a request that got as far as the key check (src/lib/api/api-route.ts). */
const RATE_LIMIT_HEADERS = {
  "RateLimit-Limit": { $ref: "#/components/headers/RateLimitLimit" },
  "RateLimit-Remaining": { $ref: "#/components/headers/RateLimitRemaining" },
  "RateLimit-Reset": { $ref: "#/components/headers/RateLimitReset" },
};

/**
 * Error responses, written out in every operation rather than as
 * $ref'd components/responses, so tools that don't resolve response refs
 * (some agent scanners, function-calling converters) still see the typed
 * Error body on each 4xx/5xx. Also listed under components.responses.
 */
const ERROR_RESPONSES = {
    BadRequest: { description: "Invalid input", content: json(ref("Error")) },
    Unauthorized: { description: "Missing or invalid API key", content: json(ref("Error")) },
    Forbidden: { description: "The key lacks the scope, or the user lacks the role or project permission", content: json(ref("Error")) },
    NotFound: { description: "No such project/task, or not visible to the key's user", content: json(ref("Error")) },
    RateLimited: {
      description: "Too many requests for this key",
      headers: { "Retry-After": { description: "Seconds to wait before retrying.", schema: { type: "integer" } }, ...RATE_LIMIT_HEADERS },
      content: json(ref("Error")),
    },
    InternalError: { description: "Something failed on Guidon's side; safe to retry with the same Idempotency-Key", content: json(ref("Error")) },
    IdempotencyInProgress: { description: "A request with this Idempotency-Key is still running (code idempotency_in_progress)", content: json(ref("Error")) },
    IdempotencyKeyReused: { description: "This Idempotency-Key was used for a different request (code idempotency_key_reused)", content: json(ref("Error")) },
};

/** The errors every API-key route can answer, all the Error schema. */
const COMMON_ERRORS = {
  "400": ERROR_RESPONSES.BadRequest,
  "401": ERROR_RESPONSES.Unauthorized,
  "403": ERROR_RESPONSES.Forbidden,
  "404": ERROR_RESPONSES.NotFound,
  "429": ERROR_RESPONSES.RateLimited,
  "500": ERROR_RESPONSES.InternalError,
};

const WRITE_METHODS = new Set(["post", "patch", "put", "delete"]);

/**
 * What every operation shares, added in one pass: rate-limit headers on
 * success responses, and Idempotency-Key with its 409/422 on every write.
 */
function finishPaths(paths: Record<string, Record<string, unknown>>): Record<string, unknown> {
  for (const item of Object.values(paths)) {
    // Path-level parameters are repeated on every operation (and dropped
    // from the path item): converters that turn each operation into a
    // function call look at the operation alone.
    const shared = (item.parameters as unknown[] | undefined) ?? [];
    delete item.parameters;
    for (const [method, operation] of Object.entries(item)) {
      if (!operation || typeof operation !== "object") continue;
      const op = operation as { responses: Record<string, Record<string, unknown>>; parameters?: unknown[] };
      if (shared.length) op.parameters = [...shared, ...(op.parameters ?? [])];
      for (const [status, response] of Object.entries(op.responses)) {
        if (status.startsWith("2") && !("$ref" in response)) response.headers = { ...RATE_LIMIT_HEADERS, ...(response.headers as object) };
      }
      if (WRITE_METHODS.has(method)) {
        op.parameters = [...(op.parameters ?? []), { $ref: "#/components/parameters/IdempotencyKey" }];
        op.responses["409"] = ERROR_RESPONSES.IdempotencyInProgress;
        op.responses["422"] = ERROR_RESPONSES.IdempotencyKeyReused;
      }
    }
  }
  return paths;
}

const projectIdParam = {
  name: "projectId",
  in: "path",
  required: true,
  description: "The project's UUID (from GET /projects).",
  schema: { type: "string", format: "uuid" },
};
const taskIdParam = {
  name: "taskId",
  in: "path",
  required: true,
  description: "The task's UUID.",
  schema: { type: "string", format: "uuid" },
};

function op(
  operationId: string,
  summary: string,
  scope: string,
  responses: Record<string, unknown>,
  extra: Record<string, unknown> = {}
) {
  return {
    operationId,
    summary,
    description: scope
      ? `${extra.description ? `${extra.description}\n\n` : ""}Requires the \`${scope}\` scope.`
      : String(extra.description ?? ""),
    security: [{ apiKey: scope ? [scope] : [] }, { oauth2: scope ? [scope] : [] }],
    ...Object.fromEntries(Object.entries(extra).filter(([key]) => key !== "description")),
    responses: { ...responses, ...COMMON_ERRORS },
  };
}

/** JSON Schema of a whole zod object (the project-resource bodies). */
function objectBody(schema: z.ZodObject<z.ZodRawShape>): JsonSchema {
  const out = z.toJSONSchema(schema, { target: "draft-2020-12" }) as JsonSchema;
  delete out.$schema;
  return out;
}

/** Decisions, knowledge, roadmap, memory, tech stack - from lib/api/project-resources.ts. */
function projectResourcePaths(): Record<string, unknown> {
  const paths: Record<string, unknown> = {};
  for (const r of PROJECT_RESOURCES) {
    const tag = "Project knowledge";
    const id = r.noun.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    const Id = id.charAt(0).toUpperCase() + id.slice(1);
    const Plural = r.plural.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()).replace(/^./, (c) => c.toUpperCase());
    const created = objectBody(r.create) as { properties?: Record<string, unknown> };
    const itemSchema = {
      type: "object",
      description: `A row of ${r.table}.`,
      properties: {
        id: { type: "string", format: "uuid" },
        project_id: { type: "string", format: "uuid" },
        ...(created.properties ?? {}),
        created_at: { type: "string", format: "date-time" },
        updated_at: { type: "string", format: "date-time" },
      },
      required: ["id", "project_id"],
    };
    const itemParam = { name: "itemId", in: "path", required: true, description: `The ${r.noun.replace(/_/g, " ")}'s UUID.`, schema: { type: "string", format: "uuid" } };
    paths[`/projects/{projectId}/${r.path}`] = {
      parameters: [projectIdParam],
      get: op(`list${Plural}`, `${r.summary} (up to 500)`, "project:read", ok(Plural, wrap(r.listKey, { type: "array", items: itemSchema })), { tags: [tag] }),
      post: op(`create${Id}`, `Add a ${r.noun.replace(/_/g, " ")}`, "project:write", ok(`The created ${r.noun.replace(/_/g, " ")}`, wrap(r.itemKey, itemSchema), "201"), {
        tags: [tag],
        requestBody: { required: true, content: json(objectBody(r.create)) },
      }),
    };
    paths[`/projects/{projectId}/${r.path}/{itemId}`] = {
      parameters: [projectIdParam, itemParam],
      get: op(`get${Id}`, `Get a ${r.noun.replace(/_/g, " ")}`, "project:read", ok(Id, wrap(r.itemKey, itemSchema)), { tags: [tag] }),
      patch: op(`update${Id}`, `Change some fields of a ${r.noun.replace(/_/g, " ")}`, "project:write", ok(`The updated ${r.noun.replace(/_/g, " ")}`, wrap(r.itemKey, itemSchema)), {
        tags: [tag],
        requestBody: { required: true, content: json(objectBody(r.update)) },
      }),
      delete: op(`delete${Id}`, `Delete a ${r.noun.replace(/_/g, " ")}`, "project:write", ok("Deleted", ref("Deleted")), { tags: [tag] }),
    };
  }
  return paths;
}

export function buildOpenApiDocument(siteUrl: string): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    info: {
      title: "Guidon API",
      version: "1.0.0",
      summary: "Tasks, decisions, knowledge, roadmap and memory of Guidon projects, for AI agents and integrations.",
      description:
        "Guidon is context-first project management for development teams. This API lets an agent find a task, " +
        "read its full working context, claim it, record what it tried, comment and hand it back for review.\n\n" +
        "Authenticate with a user's API key (Profile -> API keys): `Authorization: Bearer guidon_...`. A key acts " +
        "as that user - their projects, their role - limited to the key's scopes.\n\n" +
        "**Errors** are JSON: `{ \"error\": \"message\", \"code\": \"not_found\", \"hint\": \"...\", \"docs\": \"...\" }` - branch on `code`.\n\n" +
        "**Rate limits**: 60 requests per minute per key. Every response carries `RateLimit-Limit`, `RateLimit-Remaining`, " +
        "`RateLimit-Reset` (and the draft `RateLimit`/`RateLimit-Policy` fields); a 429 carries `Retry-After`.\n\n" +
        "**Retries**: send an `Idempotency-Key` header (e.g. a UUID) on POST/PATCH/DELETE. For 24 hours a retry with the same key " +
        "returns the first response (`Idempotent-Replayed: true`) instead of writing twice.\n\n" +
        "**Pagination**: list endpoints that can grow large take `limit` and `cursor` and return `next_cursor` (null on the last page).\n\n" +
        "**Bulk**: POST /batch runs up to 20 operations in order in one request.\n\n" +
        "**Versioning**: the version is in the path (`/api/v1`). Within v1 changes are additive only - new endpoints, fields and " +
        "optional parameters. A breaking change ships as /api/v2; a v1 endpoint scheduled for removal gets `Deprecation` " +
        "(RFC 9745) and `Sunset` (RFC 8594) headers at least 6 months before it goes, and is announced on " + `${siteUrl}/developers#versioning.\n\n` +
        `The same operations are available as an MCP server (Streamable HTTP) at ${siteUrl}/api/mcp. ` +
        `Guide for agents: ${siteUrl}/llms.txt`,
      contact: { name: "Guidon", url: `${siteUrl}/contact`, email: "guidon.support@gmail.com" },
      termsOfService: `${siteUrl}/legal/terms`,
    },
    externalDocs: { description: "Developer guide", url: `${siteUrl}/developers` },
    servers: [{ url: `${siteUrl}/api/v1` }],
    tags: [
      { name: "Projects", description: "Projects the key's user belongs to, their board columns and moodboard." },
      { name: "Tasks", description: "Board cards: read, create, edit, claim, move and complete." },
      { name: "Comments", description: "Task comments." },
      { name: "Attempts", description: "What was tried on a task and how it went, so later work learns from it." },
      { name: "Reports", description: "Bug reports from shipped games and websites." },
      { name: "Project knowledge", description: "Everything around the board: decisions, knowledge sources, roadmap phases, project memory and the tech stack." },
      { name: "Batch", description: "Several operations in one request." },
      { name: "Account", description: "The token's own user: who it is, and deleting the account." },
      { name: "Jobs", description: "Work that doesn't finish in one request: 202 Accepted, then poll the job." },
      { name: "Sandbox", description: "A test organization and project of your own, with example data you can reset." },
    ],
    paths: finishPaths({
      "/projects": {
        get: op("listProjects", "List the projects the key's user belongs to", "tasks:read", ok("Projects", wrap("projects", { type: "array", items: ref("Project") })), {
          tags: ["Projects"],
          description: "Alphabetical by name.",
          parameters: [{ name: "limit", in: "query", required: false, description: "At most this many projects.", schema: { type: "integer", minimum: 1, maximum: 1000, default: 1000 } }],
        }),
      },
      "/projects/{projectId}/tasks": {
        parameters: [projectIdParam],
        get: op("listTasks", "List a project's tasks, newest first, a page at a time", "tasks:read", ok("A page of tasks", {
          type: "object",
          properties: { tasks: { type: "array", items: ref("Task") }, next_cursor: ref("NextCursor") },
          required: ["tasks", "next_cursor"],
        }), {
          tags: ["Tasks"],
          description: "Pass `next_cursor` back as `cursor` until it is null.",
          parameters: [{ $ref: "#/components/parameters/Limit" }, { $ref: "#/components/parameters/Cursor" }],
        }),
        post: op("createTask", "Create a task or subtask", "tasks:write", ok("The created task", wrap("task", ref("Task"))), {
          tags: ["Tasks"],
          description: "A top-level task defaults to `backlog`/`medium`; with `parent_task_id` it is a subtask and starts as `todo`/`medium`.",
          requestBody: { required: true, content: json(body(createTaskFields, ["title"])) },
        }),
      },
      "/projects/{projectId}/columns": {
        parameters: [projectIdParam],
        get: op("listColumns", "The project's visible board columns, in order", "tasks:read", ok("Columns", wrap("columns", { type: "array", items: ref("Column") })), { tags: ["Projects"] }),
      },
      "/projects/{projectId}/priorities": {
        parameters: [projectIdParam],
        get: op("listPriorities", "The project's task priorities, most important first", "tasks:read", ok("Priorities", wrap("priorities", { type: "array", items: ref("Priority") })), { tags: ["Projects"] }),
      },
      "/projects/{projectId}/references": {
        parameters: [projectIdParam],
        get: op("listReferences", "The project's moodboard images, with short-lived signed URLs", "tasks:read", ok("References", wrap("references", { type: "array", items: ref("Reference") })), { tags: ["Projects"] }),
      },
      "/projects/{projectId}/reports": {
        parameters: [projectIdParam],
        post: op("fileReport", "File a bug report (creates a Backlog task with attachments)", "reports:write", ok("The created task", { type: "object", properties: { task: ref("Task"), attachments: { type: "array", items: ref("Attachment") }, warnings: { type: "array", items: { type: "string" } } } }, "201"), {
          tags: ["Reports"],
          description: "For keys that ship inside a game or website: `reports:write` can't be combined with another scope. Answers CORS for browser use.",
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  required: ["title"],
                  properties: {
                    title: { type: "string" },
                    description: { type: "string" },
                    category: { type: "string", enum: [...REPORT_CATEGORIES] },
                    source: { type: "string", enum: [...REPORT_SOURCES] },
                    reporter: { type: "string" },
                    metadata: { type: "string", description: "JSON object of flat key/value pairs (version, platform, ...)." },
                    file: { type: "array", items: { type: "string", format: "binary" } },
                  },
                },
              },
            },
          },
        }),
      },
      "/tasks/{taskId}": {
        parameters: [taskIdParam],
        get: op("getTask", "Get a task", "tasks:read", ok("The task", wrap("task", ref("Task"))), { tags: ["Tasks"] }),
        patch: op("updateTask", "Edit a task's fields (not its status)", "tasks:write", ok("The updated task", wrap("task", ref("Task"))), {
          tags: ["Tasks"],
          requestBody: { required: true, content: json(body(updateTaskFields)) },
        }),
        delete: op("deleteTask", "Delete a task permanently (owner/admin of the project)", "tasks:write", ok("Deleted", ref("Deleted")), { tags: ["Tasks"] }),
      },
      "/tasks/{taskId}/context": {
        parameters: [taskIdParam],
        get: op("getTaskContext", "Everything needed to do the task, as Markdown", "tasks:read", {
          "200": { description: "The task's working context", content: { "text/markdown": { schema: { type: "string" } } } },
        }, {
          tags: ["Tasks"],
          description: "The task, project constraints, facts, related decisions, files, PRs and previous attempts.",
        }),
      },
      "/tasks/{taskId}/start": {
        parameters: [taskIdParam],
        post: op("startTask", "Claim a task (moves it to in progress / AI working)", "tasks:status", ok("The started task", wrap("task", ref("Task"))), { tags: ["Tasks"] }),
      },
      "/tasks/{taskId}/status": {
        parameters: [taskIdParam],
        patch: op("setTaskStatus", "Move a task to another column", "tasks:status", ok("The moved task", wrap("task", ref("Task"))), {
          tags: ["Tasks"],
          description: "Set `review` when the work is done so a human checks it. The project may limit which moves AI keys can make.",
          requestBody: { required: true, content: json(body(setStatusFields)) },
        }),
      },
      "/tasks/{taskId}/complete": {
        parameters: [taskIdParam],
        post: op("completeTask", "Mark a task done (only if the project allows AI auto-complete)", "tasks:status", ok("The completed task", wrap("task", ref("Task"))), { tags: ["Tasks"] }),
      },
      "/tasks/{taskId}/comment": {
        parameters: [taskIdParam],
        get: op("listComments", "List a task's comments", "tasks:read", ok("Comments", wrap("comments", { type: "array", items: ref("Comment") })), { tags: ["Comments"] }),
        post: op("commentOnTask", "Comment on a task", "comments:write", ok("The comment", wrap("comment", ref("Comment"))), {
          tags: ["Comments"],
          requestBody: { required: true, content: json(body(commentFields)) },
        }),
      },
      "/tasks/{taskId}/attempts": {
        parameters: [taskIdParam],
        get: op("listAttempts", "List the attempts recorded on a task, newest first", "tasks:read", ok("Attempts", wrap("attempts", { type: "array", items: ref("Attempt") })), { tags: ["Attempts"] }),
        post: op("recordAttempt", "Record an attempt (including failed and partial ones)", "attempts:write", ok("The attempt", wrap("attempt", ref("Attempt"))), {
          tags: ["Attempts"],
          requestBody: { required: true, content: json(body(recordAttemptFields)) },
        }),
      },
      "/projects/{projectId}/tasks/import": {
        parameters: [projectIdParam],
        post: op("importTasks", "Create many tasks asynchronously (up to 500)", "tasks:write", {
          "202": {
            description: "Accepted - the tasks are created in the background. Poll the job at the Location header (or job.status_url).",
            headers: {
              Location: { description: "URL of the job: GET it until status is succeeded or failed.", schema: { type: "string", format: "uri" } },
              "Retry-After": { description: "Seconds to wait before polling.", schema: { type: "integer" } },
            },
            content: json({ type: "object", properties: { job: ref("Job") }, required: ["job"] }),
          },
        }, {
          tags: ["Tasks"],
          description: "Each task goes through the same checks as POST /projects/{projectId}/tasks (scopes, permissions, plan limits); the job's result lists the ids created and the ones that failed, with why.",
          requestBody: {
            required: true,
            content: json({
              type: "object",
              required: ["tasks"],
              properties: { tasks: { type: "array", minItems: 1, maxItems: 500, items: body(createTaskFields, ["title"]) } },
            }),
          },
        }),
      },
      "/jobs/{jobId}": {
        parameters: [{ name: "jobId", in: "path", required: true, description: "The job's UUID (from a 202 response).", schema: { type: "string", format: "uuid" } }],
        get: op("getJob", "Status, progress and result of an async job", "tasks:read", ok("The job", { type: "object", properties: { job: ref("Job") }, required: ["job"] }), {
          tags: ["Jobs"],
          description: "While status is queued or running the response carries Retry-After; poll until succeeded or failed.",
        }),
      },
      "/sandbox": {
        get: op("getSandbox", "Where your sandbox is", "tasks:read", ok("The sandbox", { type: "object", properties: { sandbox: ref("Sandbox") }, required: ["sandbox"] }), {
          tags: ["Sandbox"],
          description: "404 until one exists - POST creates it.",
        }),
        post: op("setUpSandbox", "Create your sandbox, or reset it", "tasks:write", {
          ...ok("The existing or reset sandbox", { type: "object", properties: { sandbox: ref("Sandbox") }, required: ["sandbox"] }),
          ...ok("Created", { type: "object", properties: { sandbox: ref("Sandbox") }, required: ["sandbox"] }, "201"),
        }, {
          tags: ["Sandbox"],
          description:
            "A test environment of your own: a separate organization (is_sandbox) with one project of example tasks, to try the API, the MCP server or an agent " +
            "without touching real work. { \"reset\": true } replaces its project with fresh example data.",
          requestBody: { required: false, content: json({ type: "object", properties: { reset: { type: "boolean", default: false } } }) },
        }),
      },
      "/me": {
        get: op("getMe", "Who this token acts as", "", ok("The user and the token", {
          type: "object",
          properties: {
            user: { type: "object", properties: { id: { type: "string", format: "uuid" }, email: { type: ["string", "null"] }, name: { type: ["string", "null"] } }, required: ["id"] },
            token: { type: "object", properties: { scopes: { type: "array", items: { type: "string" } }, project_id: { type: ["string", "null"], format: "uuid" }, human_client: { type: "boolean" } } },
          },
          required: ["user", "token"],
        }), { tags: ["Account"], description: "Any valid API key or OAuth token; no scope needed." }),
      },
      "/account": {
        get: op("getAccountDeletionPlan", "What deleting the account would do", "", ok("The plan", {
          type: "object",
          properties: { plan: ref("DeletionPlan") },
          required: ["plan"],
        }), { tags: ["Account"], description: "Only keys a person uses directly (the mobile app, editor plugins) - never an AI or OAuth key." }),
        delete: op("deleteAccount", "Delete the account for good", "", ok("Deleted", {
          type: "object",
          properties: { deleted: { type: "boolean", const: true }, deleted_organizations: { type: "integer" } },
          required: ["deleted"],
        }), {
          tags: ["Account"],
          description:
            "Only keys a person uses directly (the mobile app, editor plugins) - never an AI or OAuth key. Organizations with nobody else in them are deleted too; " +
            "if the person is the only owner of an organization others work in, the answer is 409 `organizations_need_owner` until it's handed over.",
          requestBody: { required: true, content: json({ type: "object", required: ["confirm_email"], properties: { confirm_email: { type: "string", format: "email", description: "The account's email, as confirmation." } } }) },
        }),
      },
      "/batch": {
        post: op("batch", "Run up to 20 operations in one request", "", ok("One result per operation, in order", {
          type: "object",
          properties: {
            results: {
              type: "array",
              items: {
                type: "object",
                properties: { status: { type: "integer", description: "The HTTP status the operation got." }, body: { description: "Its JSON body (or text)." } },
                required: ["status", "body"],
              },
            },
          },
          required: ["results"],
        }), {
          tags: ["Batch"],
          description:
            "Each operation runs through the same endpoint as a direct call - same scopes, permissions and rate limit (each operation counts). " +
            "Needs no scope of its own - each operation needs its usual one. Not a transaction: operations succeed or fail on their own. Reachable paths: /projects, /projects/{id}/tasks|columns|priorities, " +
            "the project knowledge collections and items, /tasks/{id} and its context|start|status|complete|comment|attempts.",
          requestBody: {
            required: true,
            content: json({
              type: "object",
              required: ["operations"],
              properties: {
                operations: {
                  type: "array",
                  minItems: 1,
                  maxItems: 20,
                  items: {
                    type: "object",
                    required: ["method", "path"],
                    properties: {
                      method: { type: "string", enum: ["GET", "POST", "PATCH", "DELETE"] },
                      path: { type: "string", description: "Path relative to /api/v1, e.g. /tasks/{taskId}/status.", examples: ["/projects"] },
                      body: { type: "object", description: "JSON body of the operation." },
                    },
                  },
                },
              },
            }),
          },
        }),
      },
      ...projectResourcePaths(),
    }),
    components: {
      securitySchemes: {
        oauth2: {
          type: "oauth2",
          description: `OAuth 2.1 for apps acting for a person - public clients with PKCE (S256), refresh tokens rotate. See ${siteUrl}/auth.md.`,
          flows: {
            authorizationCode: {
              authorizationUrl: `${siteUrl}/oauth/authorize`,
              tokenUrl: `${siteUrl}/oauth/token`,
              refreshUrl: `${siteUrl}/oauth/token`,
              scopes: {
                "tasks:read": "List projects and tasks, read tasks, comments, attempts and context",
                "tasks:write": "Create, edit and delete tasks",
                "tasks:status": "Start, move and complete tasks",
                "comments:write": "Comment on tasks",
                "attempts:write": "Record attempts",
                "project:read": "Read decisions, knowledge, roadmap, memory and tech stack",
                "project:write": "Change decisions, knowledge, roadmap, memory and tech stack",
              },
            },
          },
        },
        apiKey: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "guidon_...",
          description: "A user's API key from Profile -> API keys. Scopes: tasks:read, tasks:write, tasks:status, comments:write, attempts:write, reports:write, project:read, project:write.",
        },
      },
      schemas: {
        Error: {
          type: "object",
          properties: {
            error: { type: "string", description: "What went wrong, for people." },
            code: {
              type: "string",
              description: "Machine-readable reason - branch on this, not on `error`.",
              examples: ["invalid_request", "unauthorized", "forbidden", "not_found", "rate_limited", "idempotency_key_reused"],
            },
            hint: { type: "string", description: "What to do about it." },
            docs: { type: "string", format: "uri" },
          },
          required: ["error", "code"],
        },
        DeletionPlan: {
          type: "object",
          properties: {
            deleteOrganizations: { type: "array", items: { $ref: "#/components/schemas/OrgRef" }, description: "No one else in them - deleted with the account." },
            leaveOrganizations: { type: "array", items: { $ref: "#/components/schemas/OrgRef" }, description: "The person leaves them." },
            blockers: { type: "array", items: { $ref: "#/components/schemas/OrgRef" }, description: "Only owner while others work there - hand over first." },
          },
          required: ["deleteOrganizations", "leaveOrganizations", "blockers"],
        },
        Job: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            kind: { type: "string", enum: ["task_import"] },
            status: { type: "string", enum: ["queued", "running", "succeeded", "failed"] },
            progress: { type: "object", properties: { done: { type: "integer" }, total: { type: "integer" } }, required: ["done", "total"] },
            result: {
              type: ["object", "null"],
              properties: {
                created: { type: "array", items: { type: "string", format: "uuid" } },
                failed: { type: "array", items: { type: "object", properties: { index: { type: "integer" }, status: { type: "integer" }, error: { type: "string" } } } },
              },
            },
            error: { type: ["string", "null"] },
            created_at: { type: "string", format: "date-time" },
            updated_at: { type: "string", format: "date-time" },
            status_url: { type: "string", format: "uri" },
          },
          required: ["id", "kind", "status", "progress", "status_url"],
        },
        Sandbox: {
          type: "object",
          properties: {
            organization_id: { type: "string", format: "uuid" },
            project_id: { type: ["string", "null"], format: "uuid" },
            created: { type: "boolean" },
            reset: { type: "boolean" },
            board_url: { type: ["string", "null"], format: "uri" },
            reset_with: { type: "object", properties: { method: { type: "string" }, url: { type: "string", format: "uri" }, body: { type: "object" } } },
          },
          required: ["organization_id", "project_id"],
        },
        OrgRef: { type: "object", properties: { id: { type: "string", format: "uuid" }, name: { type: "string" } }, required: ["id", "name"] },
        NextCursor: { type: ["string", "null"], description: "Pass as `cursor` for the next page; null on the last page." },
        Deleted: { type: "object", properties: { ok: { type: "boolean", const: true } }, required: ["ok"] },
        Attempt: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            task_id: { type: "string", format: "uuid" },
            problem: { type: "string" },
            approach: { type: "string" },
            outcome: { type: "string", enum: ["failed", "partial", "succeeded"] },
            result: { type: ["string", "null"] },
            failure_reason: { type: ["string", "null"] },
            files_changed: { type: ["array", "null"], items: { type: "string" } },
            related_pr_url: { type: ["string", "null"], format: "uri" },
            agent: { type: ["string", "null"], description: "Which agent made the attempt." },
            created_by: { type: ["string", "null"], format: "uuid" },
            created_at: { type: "string", format: "date-time" },
          },
          required: ["id", "task_id", "problem", "approach", "outcome"],
        },
        Reference: {
          type: "object",
          description: "A moodboard image.",
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string" },
            caption: { type: ["string", "null"] },
            tags: { type: "array", items: { type: "string" } },
            mime_type: { type: "string" },
            size_bytes: { type: ["integer", "null"] },
            source_url: { type: ["string", "null"], format: "uri" },
            image_url: { type: ["string", "null"], format: "uri", description: "Short-lived signed URL." },
            created_at: { type: "string", format: "date-time" },
          },
          required: ["id", "name"],
        },
        Attachment: {
          type: "object",
          properties: { id: { type: "string", format: "uuid" }, name: { type: "string" } },
          required: ["id", "name"],
        },
        Project: {
          type: "object",
          properties: { id: { type: "string", format: "uuid" }, name: { type: "string" }, organization_id: { type: "string", format: "uuid" } },
        },
        Task: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            project_id: { type: "string", format: "uuid" },
            parent_task_id: { type: ["string", "null"], format: "uuid" },
            title: { type: "string" },
            description: { type: ["string", "null"] },
            status: statusSchema,
            priority: prioritySchema,
            is_done: { type: "boolean", description: "In done or a column the project marks as done." },
            tags: { type: "array", items: { type: "string" } },
            assignee_id: { type: ["string", "null"], format: "uuid" },
            due_date: { type: ["string", "null"], format: "date-time" },
            sort_order: { type: "number" },
            created_at: { type: "string", format: "date-time" },
            updated_at: { type: "string", format: "date-time" },
          },
        },
        Column: {
          type: "object",
          properties: {
            status: statusSchema,
            label: { type: "string" },
            is_done: { type: "boolean", description: "Tasks in this column count as finished." },
            custom: { type: "boolean", description: "A column the project added, not a built-in one." },
            color: { type: ["string", "null"], description: "Hex colour of a custom column." },
          },
        },
        Priority: {
          type: "object",
          properties: {
            key: prioritySchema,
            label: { type: "string" },
            custom: { type: "boolean" },
            color: { type: ["string", "null"] },
          },
        },
        Comment: {
          type: "object",
          properties: { id: { type: "string", format: "uuid" }, task_id: { type: "string", format: "uuid" }, content: { type: "string" }, created_at: { type: "string", format: "date-time" } },
        },
      },
      responses: ERROR_RESPONSES,
      parameters: {
        IdempotencyKey: {
          name: "Idempotency-Key",
          in: "header",
          required: false,
          description: "Any unique string (a UUID works). A retry with the same key within 24 hours returns the first response instead of writing again.",
          schema: { type: "string", minLength: 1, maxLength: 255 },
        },
        Limit: { name: "limit", in: "query", required: false, description: "Items per page.", schema: { type: "integer", minimum: 1, maximum: 1000, default: 1000 } },
        Cursor: { name: "cursor", in: "query", required: false, description: "next_cursor of the previous page.", schema: { type: "string" } },
      },
      headers: {
        RateLimitLimit: { description: "Requests allowed per window (60 per minute per key).", schema: { type: "integer" } },
        RateLimitRemaining: { description: "Requests left in the current window.", schema: { type: "integer" } },
        RateLimitReset: { description: "Seconds until the window resets.", schema: { type: "integer" } },
      },
    },
  };
}
