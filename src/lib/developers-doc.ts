// No imports: loaded by tests/agent-web.test.mjs with Node's type stripping.

// Same values as lib/project-links.ts (test:agent-web checks they match).
const GITHUB_REPO_URL = "https://github.com/two-steps-studio/guidon";
const SELF_HOSTING_DOCS_URL = `${GITHUB_REPO_URL}/blob/main/docs/self-hosting.md`;

/**
 * The developer guide: one Markdown source for /developers (rendered as
 * HTML), /developers.md (its Markdown twin) and the section index
 * /developers/llms.txt. Endpoint details live in /openapi.json; this is the
 * how-to around it.
 */
export function developersMarkdown(siteUrl: string): string {
  return `# Guidon for developers and AI agents

Guidon is context-first project management for development teams: a task board per project, plus the decisions, sources and project memory behind the work. Everything you can do in a project, an agent or a script can do through the **REST API** or the **MCP server** - find a task, read its full context, claim it, record what was tried, comment and hand it back for review; and keep the rest of the project current: decisions, knowledge sources, the roadmap, project memory and the tech stack.

## Authentication

Two ways in, both sent as \`Authorization: Bearer ...\`:

- **OAuth 2.1** - for MCP clients and apps acting for someone (Claude, ChatGPT, Cursor, VS Code...). Give the client \`${siteUrl}/api/mcp\`; it finds the authorization server from the \`401\`, registers itself, and the person approves it on Guidon's consent screen. Access tokens last an hour and refresh; the person can disconnect the app in Profile → Connected apps. Every step is in [auth.md](${siteUrl}/auth.md).
- **An API key** - for scripts, CI and your own agents:

1. Sign in and open [Profile → API keys](${siteUrl}/profile). Create a key and pick its scopes.
2. Send it on every request: \`Authorization: Bearer guidon_...\`.

A key acts as the user who created it - their projects, their role in each project - narrowed to its scopes:

| Scope | Allows |
|---|---|
| \`tasks:read\` | List projects and tasks, read tasks, comments, attempts and task context |
| \`tasks:write\` | Create, edit and delete tasks |
| \`tasks:status\` | Start, move and complete tasks |
| \`comments:write\` | Comment on tasks |
| \`attempts:write\` | Record attempts |
| \`project:read\` | Read decisions, knowledge sources, roadmap phases, project memory and the tech stack |
| \`project:write\` | Add, edit and delete those (memory added this way starts unverified until a person verifies it) |
| \`reports:write\` | File bug reports only - for keys shipped inside a game or website; can't be combined with other scopes |

For an agent that should work under its own name - assignable, with its own project role, signing its own comments - an organization owner or admin can create an **AI account** (Organization → AI accounts) and give it keys; it can't sign in, it only acts through those keys.

Project admins decide what AI keys may do in their project (change status, complete tasks, comment); keys from Guidon's own editor plugins and the Discord bot act as a person and skip those AI limits.

## Quickstart

\`\`\`bash
export GUIDON_API_KEY="guidon_..."

# Your projects
curl -s ${siteUrl}/api/v1/projects -H "Authorization: Bearer $GUIDON_API_KEY"

# Tasks in one of them
curl -s ${siteUrl}/api/v1/projects/<projectId>/tasks -H "Authorization: Bearer $GUIDON_API_KEY"

# Everything needed to work on a task, as Markdown
curl -s ${siteUrl}/api/v1/tasks/<taskId>/context -H "Authorization: Bearer $GUIDON_API_KEY"

# Hand it back for review
curl -s -X PATCH ${siteUrl}/api/v1/tasks/<taskId>/status \\
  -H "Authorization: Bearer $GUIDON_API_KEY" -H "Content-Type: application/json" \\
  -d '{"status":"review"}'
\`\`\`

## MCP server

\`${siteUrl}/api/mcp\` speaks MCP over Streamable HTTP with the same bearer key. The easiest setup is [Profile → Integrations → Connect an AI app](${siteUrl}/profile): pick Claude Code, Claude Desktop, Cursor, VS Code, Codex CLI, Gemini CLI or another app, and Guidon creates a key with the right scopes and shows that app's exact configuration.

Claude Code, by hand:

\`\`\`bash
claude mcp add --transport http --scope user guidon ${siteUrl}/api/mcp --header "Authorization: Bearer guidon_..."
\`\`\`

Tools: \`list_projects\`, \`list_tasks\`, \`list_columns\`, \`list_priorities\`, \`get_task\`, \`get_task_context\`, \`create_task\`, \`update_task\`, \`delete_task\`, \`start_task\`, \`set_task_status\`, \`complete_task\`, \`comment_on_task\`, \`list_attempts\`, \`record_attempt\` - and for the rest of the project, five tools each (list, get, create, update, delete) for \`decision\`, \`knowledge_source\`, \`roadmap_phase\`, \`memory\` and \`technology\` (e.g. \`list_decisions\`, \`create_memory\`, \`update_roadmap_phase\`).

Recommended flow for an agent: \`get_task_context\` → \`start_task\` → do the work → \`record_attempt\` → \`comment_on_task\` → \`set_task_status\` with \`review\`.

## REST API

Base URL \`${siteUrl}/api/v1\`, JSON in and out. The full description is the [OpenAPI 3.1 document](${siteUrl}/openapi.json); the API catalog is at [/.well-known/api-catalog](${siteUrl}/.well-known/api-catalog).

| Method | Path | Does |
|---|---|---|
| GET | \`/projects\` | Projects the key's user belongs to |
| GET, POST | \`/projects/{projectId}/tasks\` | List or create tasks |
| GET | \`/projects/{projectId}/columns\` | The project's board columns - built-in and its own, with \`is_done\` |
| GET | \`/projects/{projectId}/priorities\` | The project's priorities, most important first |
| GET, PATCH, DELETE | \`/tasks/{taskId}\` | Read, edit or delete a task |
| GET | \`/tasks/{taskId}/context\` | The task's full working context (Markdown) |
| POST | \`/tasks/{taskId}/start\` | Claim a task |
| PATCH | \`/tasks/{taskId}/status\` | Move a task to another column |
| POST | \`/tasks/{taskId}/complete\` | Mark done, if the project allows it |
| GET, POST | \`/tasks/{taskId}/comment\` | Read or post comments |
| GET, POST | \`/tasks/{taskId}/attempts\` | Read or record attempts |
| POST | \`/projects/{projectId}/reports\` | File a bug report (multipart) |
| GET, POST | \`/projects/{projectId}/{decisions,knowledge,roadmap,memory,technologies}\` | List or add decisions, knowledge sources, roadmap phases, memory, technologies |
| GET, PATCH, DELETE | \`/projects/{projectId}/{...}/{id}\` | Read, edit or delete one of them |
| POST | \`/batch\` | Up to 20 of the operations above in one request |

## Errors

Errors are JSON with an HTTP status, a message for people and a \`code\` to branch on:

\`\`\`json
{ "error": "Task not found.", "code": "not_found", "hint": "Check the id. ...", "docs": "${siteUrl}/developers#errors" }
\`\`\`

| Status | \`code\` | Meaning |
|---|---|---|
| 400 | \`invalid_request\` | Invalid input - the message says which field |
| 401 | \`unauthorized\` | Missing or invalid API key |
| 403 | \`forbidden\` | The key lacks the scope, or the user the role or permission |
| 404 | \`not_found\` | No such thing, or not visible to the key's user |
| 409 | \`idempotency_in_progress\` | A request with the same Idempotency-Key is still running |
| 422 | \`idempotency_key_reused\` | The Idempotency-Key was used for a different request |
| 429 | \`rate_limited\` | Too many requests - wait \`Retry-After\` seconds |
| 500 | \`internal_error\` | Something failed on our side - retry with the same Idempotency-Key |

Unknown paths under \`/api\` answer a JSON \`404\` as well.

## Rate limits

60 requests per minute per API key. Every response says where you stand: \`RateLimit-Limit\`, \`RateLimit-Remaining\`, \`RateLimit-Reset\` (seconds), plus the IETF draft's \`RateLimit\` and \`RateLimit-Policy\`. A \`429\` carries \`Retry-After\`. Each operation of a batch counts as one request.

## Retries and idempotency

Send an \`Idempotency-Key\` header (any unique string - a UUID) on \`POST\`, \`PATCH\` and \`DELETE\`. If the network fails and you retry with the same key within 24 hours, you get the first response back (with \`Idempotent-Replayed: true\`) instead of creating a second task or comment. Use a new key for a new request; reusing one with a different body answers \`422\`.

## Pagination

\`GET /projects/{projectId}/tasks\` returns newest first, up to \`limit\` tasks (1-1000, default 1000), and \`next_cursor\`. While it isn't \`null\`, request the next page with \`?cursor=<next_cursor>\`. Cursors are opaque - don't build them yourself.

## Batch

\`POST /batch\` with \`{ "operations": [{ "method": "PATCH", "path": "/tasks/{taskId}/status", "body": { "status": "review" } }, ...] }\` runs up to 20 operations in order and answers \`{ "results": [{ "status": 200, "body": {...} }, ...] }\`. Each operation goes through the same endpoint as a direct call (same scopes and permissions); it is not a transaction - each one succeeds or fails on its own.

## Versioning

The version is in the path: \`/api/v1\`. Within v1, changes are additive only - new endpoints, new fields in responses, new optional parameters; write clients that ignore fields they don't know. A breaking change ships as \`/api/v2\`, side by side with v1. An endpoint scheduled for removal gets \`Deprecation\` (RFC 9745) and \`Sunset\` (RFC 8594) headers at least 6 months before it goes, and is listed here.

There are no deprecated endpoints right now.

## More

- [Guide for AI agents (llms.txt)](${siteUrl}/llms.txt) - when to use Guidon and how
- [Pricing as Markdown](${siteUrl}/pricing.md)
- Editor plugins (Unity, Unreal Engine, Godot, Blender, JetBrains, VS Code) and Guidon Desktop: [Plugins](${siteUrl}/plugins)
- Source code: [GitHub](${GITHUB_REPO_URL}). Guidon can be self-hosted with Docker Compose and a plain PostgreSQL - see the [self-hosting guide](${SELF_HOSTING_DOCS_URL}).
`;
}

/** /developers/llms.txt - the developer section's own index (llmstxt.org format). */
export function developersLlmsTxt(siteUrl: string): string {
  return `# Guidon developers

> How to use Guidon's REST API and MCP server: authentication with API keys, scopes, the MCP endpoint for AI agents, endpoints and errors.

## Docs

- [Developer guide](${siteUrl}/developers.md): authentication, scopes, quickstart, MCP setup, endpoint table, errors, rate limits, idempotency, pagination, batch, versioning
- [OpenAPI 3.1 document](${siteUrl}/openapi.json): every /api/v1 operation with request and response schemas
- [API catalog](${siteUrl}/.well-known/api-catalog): RFC 9727 linkset pointing at the API descriptions

## Optional

- [Site-wide guide for agents](${siteUrl}/llms.txt)
- [Pricing](${siteUrl}/pricing.md)
`;
}
