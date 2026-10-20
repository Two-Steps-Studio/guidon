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

/** The errors every API-key route can answer, all `{ "error": "..." }`. */
const COMMON_ERRORS = {
  "400": { $ref: "#/components/responses/BadRequest" },
  "401": { $ref: "#/components/responses/Unauthorized" },
  "403": { $ref: "#/components/responses/Forbidden" },
  "404": { $ref: "#/components/responses/NotFound" },
  "429": { $ref: "#/components/responses/RateLimited" },
};

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
    description: `${extra.description ? `${extra.description}\n\n` : ""}Requires the \`${scope}\` scope.`,
    security: [{ apiKey: [scope] }],
    ...Object.fromEntries(Object.entries(extra).filter(([key]) => key !== "description")),
    responses: { ...responses, ...COMMON_ERRORS },
  };
}

export function buildOpenApiDocument(siteUrl: string): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    info: {
      title: "Guidon API",
      version: "1.0.0",
      summary: "Tasks, comments and attempts in Guidon projects, for AI agents and integrations.",
      description:
        "Guidon is context-first project management for development teams. This API lets an agent find a task, " +
        "read its full working context, claim it, record what it tried, comment and hand it back for review.\n\n" +
        "Authenticate with a user's API key (Profile -> API keys): `Authorization: Bearer guidon_...`. A key acts " +
        "as that user - their projects, their role - limited to the key's scopes. Errors are JSON: `{ \"error\": \"...\" }`.\n\n" +
        `The same operations are available as an MCP server (Streamable HTTP) at ${siteUrl}/api/mcp. ` +
        `Guide for agents: ${siteUrl}/llms.txt`,
      contact: { name: "Guidon", url: `${siteUrl}/developers` },
    },
    externalDocs: { description: "Developer guide", url: `${siteUrl}/developers` },
    servers: [{ url: `${siteUrl}/api/v1` }],
    tags: [
      { name: "Projects", description: "Projects the key's user belongs to, their board columns and moodboard." },
      { name: "Tasks", description: "Board cards: read, create, edit, claim, move and complete." },
      { name: "Comments", description: "Task comments." },
      { name: "Attempts", description: "What was tried on a task and how it went, so later work learns from it." },
      { name: "Reports", description: "Bug reports from shipped games and websites." },
    ],
    paths: {
      "/projects": {
        get: op("listProjects", "List the projects the key's user belongs to", "tasks:read", ok("Projects", wrap("projects", { type: "array", items: ref("Project") })), { tags: ["Projects"] }),
      },
      "/projects/{projectId}/tasks": {
        parameters: [projectIdParam],
        get: op("listTasks", "List a project's tasks (up to 1000)", "tasks:read", ok("Tasks", wrap("tasks", { type: "array", items: ref("Task") })), { tags: ["Tasks"] }),
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
        get: op("listReferences", "The project's moodboard images, with short-lived signed URLs", "tasks:read", ok("References", wrap("references", { type: "array", items: { type: "object" } })), { tags: ["Projects"] }),
      },
      "/projects/{projectId}/reports": {
        parameters: [projectIdParam],
        post: op("fileReport", "File a bug report (creates a Backlog task with attachments)", "reports:write", ok("The created task", { type: "object", properties: { task: ref("Task"), attachments: { type: "array", items: { type: "object" } }, warnings: { type: "array", items: { type: "string" } } } }, "201"), {
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
        delete: op("deleteTask", "Delete a task permanently (owner/admin of the project)", "tasks:write", ok("Deleted", { type: "object", properties: { ok: { type: "boolean", const: true } } }), { tags: ["Tasks"] }),
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
        get: op("listAttempts", "List the attempts recorded on a task, newest first", "tasks:read", ok("Attempts", wrap("attempts", { type: "array", items: { type: "object" } })), { tags: ["Attempts"] }),
        post: op("recordAttempt", "Record an attempt (including failed and partial ones)", "attempts:write", ok("The attempt", wrap("attempt", { type: "object" })), {
          tags: ["Attempts"],
          requestBody: { required: true, content: json(body(recordAttemptFields)) },
        }),
      },
    },
    components: {
      securitySchemes: {
        apiKey: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "guidon_...",
          description: "A user's API key from Profile -> API keys. Scopes: tasks:read, tasks:write, tasks:status, comments:write, attempts:write, reports:write.",
        },
      },
      schemas: {
        Error: { type: "object", properties: { error: { type: "string" } }, required: ["error"] },
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
      responses: {
        BadRequest: { description: "Invalid input", content: json(ref("Error")) },
        Unauthorized: { description: "Missing or invalid API key", content: json(ref("Error")) },
        Forbidden: { description: "The key lacks the scope, or the user lacks the role or project permission", content: json(ref("Error")) },
        NotFound: { description: "No such project/task, or not visible to the key's user", content: json(ref("Error")) },
        RateLimited: { description: "Too many requests for this key", content: json(ref("Error")) },
      },
    },
  };
}
