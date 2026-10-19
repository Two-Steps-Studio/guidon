// No imports: loaded by tests/agent-web.test.mjs with Node's type stripping.

/**
 * The developer guide: one Markdown source for /developers (rendered as
 * HTML), /developers.md (its Markdown twin) and the section index
 * /developers/llms.txt. Endpoint details live in /openapi.json; this is the
 * how-to around it.
 */
export function developersMarkdown(siteUrl: string): string {
  return `# Guidon for developers and AI agents

Guidon is context-first project management for development teams: a task board per project, plus the decisions, sources and project memory behind the work. Everything you can do on the board, an agent or a script can do through the **REST API** or the **MCP server** - find a task, read its full context, claim it, record what was tried, comment and hand it back for review.

## Authentication

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
| \`reports:write\` | File bug reports only - for keys shipped inside a game or website; can't be combined with other scopes |

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

Tools: \`list_projects\`, \`list_tasks\`, \`get_task\`, \`get_task_context\`, \`create_task\`, \`update_task\`, \`delete_task\`, \`start_task\`, \`set_task_status\`, \`complete_task\`, \`comment_on_task\`, \`list_attempts\`, \`record_attempt\`.

Recommended flow for an agent: \`get_task_context\` → \`start_task\` → do the work → \`record_attempt\` → \`comment_on_task\` → \`set_task_status\` with \`review\`.

## REST API

Base URL \`${siteUrl}/api/v1\`, JSON in and out. The full description is the [OpenAPI 3.1 document](${siteUrl}/openapi.json); the API catalog is at [/.well-known/api-catalog](${siteUrl}/.well-known/api-catalog).

| Method | Path | Does |
|---|---|---|
| GET | \`/projects\` | Projects the key's user belongs to |
| GET, POST | \`/projects/{projectId}/tasks\` | List or create tasks |
| GET | \`/projects/{projectId}/columns\` | The project's board columns |
| GET, PATCH, DELETE | \`/tasks/{taskId}\` | Read, edit or delete a task |
| GET | \`/tasks/{taskId}/context\` | The task's full working context (Markdown) |
| POST | \`/tasks/{taskId}/start\` | Claim a task |
| PATCH | \`/tasks/{taskId}/status\` | Move a task to another column |
| POST | \`/tasks/{taskId}/complete\` | Mark done, if the project allows it |
| GET, POST | \`/tasks/{taskId}/comment\` | Read or post comments |
| GET, POST | \`/tasks/{taskId}/attempts\` | Read or record attempts |
| POST | \`/projects/{projectId}/reports\` | File a bug report (multipart) |

## Errors and limits

Errors are JSON with an HTTP status: \`{ "error": "Task not found." }\`.

- \`400\` invalid input, \`401\` missing or invalid key, \`403\` missing scope or permission, \`404\` not found (or not visible to the key's user), \`429\` too many requests for this key - wait and retry.
- Unknown paths under \`/api\` answer a JSON \`404\` as well.

## More

- [Guide for AI agents (llms.txt)](${siteUrl}/llms.txt) - when to use Guidon and how
- [Pricing as Markdown](${siteUrl}/pricing.md)
- Editor plugins (Unity, Unreal Engine, Godot, Blender, JetBrains, VS Code) and Guidon Desktop: [Plugins](${siteUrl}/plugins)
- Guidon is open source and can be self-hosted.
`;
}

/** /developers/llms.txt - the developer section's own index (llmstxt.org format). */
export function developersLlmsTxt(siteUrl: string): string {
  return `# Guidon developers

> How to use Guidon's REST API and MCP server: authentication with API keys, scopes, the MCP endpoint for AI agents, endpoints and errors.

## Docs

- [Developer guide](${siteUrl}/developers.md): authentication, scopes, quickstart, MCP setup, endpoint table, errors
- [OpenAPI 3.1 document](${siteUrl}/openapi.json): every /api/v1 operation with request and response schemas
- [API catalog](${siteUrl}/.well-known/api-catalog): RFC 9727 linkset pointing at the API descriptions

## Optional

- [Site-wide guide for agents](${siteUrl}/llms.txt)
- [Pricing](${siteUrl}/pricing.md)
`;
}
