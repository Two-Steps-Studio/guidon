# Guidon MCP endpoint (`/api/mcp`) for Claude Code

**Status:** approved by user (2026-09-21). Spec and task breakdown in one document.

## Goal

Let Claude Code connect to Guidon as an MCP client and run the full task workflow: list projects and tasks, read a task's full context, create/edit tasks, start work, record attempts, comment, move to review.

    claude mcp add --transport http guidon https://<guidon-host>/api/mcp --header "Authorization: Bearer gdn_..."

## Architecture

- `POST /api/mcp` (Next route handler) using `WebStandardStreamableHTTPServerTransport` from the already-installed `@modelcontextprotocol/sdk`, **stateless** mode (`sessionIdGenerator: undefined`): a fresh `Server` + transport per request. Check `node_modules/@modelcontextprotocol/sdk/dist/esm/server/webStandardStreamableHttp.d.ts` for the exact API of the installed version before coding. GET/DELETE return 405.
- Auth: the same API key as `/api/v1`. The route calls `authenticateApiKey()` (`src/lib/api/api-key-auth.ts`) on entry (401 JSON if invalid). It does NOT call `recordRequest`; rate limiting stays with the inner v1 calls.
- `/api/mcp` must be added to `PUBLIC_ROUTE_PREFIXES`/`EXACT_PUBLIC_ROUTES` in `src/proxy.ts` (identity comes from the key, not a cookie; otherwise it redirects to login).
- **No duplicated business logic.** Each tool dispatches in-process to the existing `/api/v1` route handler: import the exported `GET`/`POST`/`PATCH`/`DELETE` from the route module, build a `NextRequest` (URL on the request origin, the original `Authorization` header, JSON body), pass `{ params: Promise.resolve({...}) }`, and turn the returned `Response` into an MCP tool result (`content: [{type:"text", text: <JSON or markdown>}]`, `isError: true` when status >= 400, including the API's error message). Scopes, rate limits, `project_ai_permissions`, RLS and `actor_label` attribution therefore behave exactly as for direct API calls.
- The old `src/lib/mcp/server.ts` / `client.ts` (stdio, session-bound, used by the in-app AI chat) are NOT touched or reused.

## Tools

| Tool | Dispatches to | Notes |
|---|---|---|
| `list_projects` | `GET /api/v1/projects` | |
| `search` | `GET /api/v1/search?q=` | |
| `list_tasks` | `GET /api/v1/projects/[projectId]/tasks` | |
| `get_task` | `GET /api/v1/tasks/[taskId]` | |
| `create_task` | `POST /api/v1/projects/[projectId]/tasks` | body fields as that route accepts |
| `update_task` | `PATCH /api/v1/tasks/[taskId]` | |
| `delete_task` | `DELETE /api/v1/tasks/[taskId]` | |
| `start_task` | `POST /api/v1/tasks/[taskId]/start` | |
| `set_task_status` | `PATCH /api/v1/tasks/[taskId]/status` | |
| `complete_task` | `POST /api/v1/tasks/[taskId]/complete` | still needs project's `allow_ai_auto_complete`; tool description tells the model to prefer `review` |
| `comment_on_task` | `POST /api/v1/tasks/[taskId]/comment` | |
| `get_task_context` | NEW `GET /api/v1/tasks/[taskId]/context` | markdown |
| `list_attempts` | NEW `GET /api/v1/tasks/[taskId]/attempts` | |
| `record_attempt` | NEW `POST /api/v1/tasks/[taskId]/attempts` | scope `attempts:write` |

Input schemas are JSON Schema in the tool list (read each v1 route's body parsing/validation to mirror field names and enums exactly; do not invent fields). Tool descriptions should tell the model the intended workflow: `get_task_context` -> `start_task` -> work -> `record_attempt` -> `comment_on_task` -> `set_task_status` to `review`.

## New v1 routes

1. **`GET /api/v1/tasks/[taskId]/context`** (scope `tasks:read`): returns the markdown that `getTaskAgentContext` produces. Today `getTaskAgentContext(projectId, taskId)` in `src/lib/context/agent-context.ts` resolves identity via `getProjectAccess()` (session cookie). Refactor: extract the body into `buildTaskAgentContext(userId, projectId, taskId)` (no session), keep `getTaskAgentContext` as a thin wrapper that resolves access then calls it. Behaviour for the UI must be identical. Internally it calls `getTaskWhyContext(projectId, taskId)` which also uses session access: apply the same split there (look at `src/lib/context/task-why.ts`), or if that is disproportionate, report back rather than guessing. The route needs the task's project id (look it up with `withUser`/`getApiUserClient` as other v1 task routes do) and must return 404 for a task the key's user cannot see.
2. **`/api/v1/tasks/[taskId]/attempts`**: GET (scope `tasks:read`) and POST (scope `attempts:write`). Mirror `loadAttempts`/`createAttempt` in `src/app/projects/[id]/work/actions.ts` (same columns, same validation incl. `isSafeHttpUrl` on `related_pr_url`, `problem`/`approach` required, `files_changed` accepted as an array of strings). RLS (`task_attempts_insert`, migration 013: owner/admin/developer) is the boundary; map its `42501` rejection to 403 like the comment route does. Set `agent` to the key's `botLabel` when present, otherwise "Claude" is NOT assumed: use the request's `agent` field or null. Both DB modes (`hasDirectDatabase()` branches, `withUser` per query rule from CLAUDE.md, no concurrent queries on one client).
3. Add `"attempts:write"` to `API_KEY_SCOPES` in `src/lib/api/scopes.ts` (update the comment there if needed). Check `src/app/profile/api-keys*` and `src/lib/api/api-keys.ts` for anything else enumerating scopes (labels/translations in `messages/*.json`) and update so the key-creation form shows it in all four languages (en, pl, de, es).

## Docs

Update `src/app/api/v1/README.md` (add the MCP endpoint, the new routes) and `docs/` if a page lists the API (grep). Add a short "Connect Claude Code" section (the `claude mcp add` command, which scopes to give the key: `tasks:read tasks:write tasks:status comments:write attempts:write`).

## Tasks

1. New v1 routes + context refactor + scope + i18n labels (commit).
2. `/api/mcp` route, tool registry, proxy allowlist (commit).
3. Docs + verification: `npx tsc --noEmit`, `npm run lint` (baseline must not grow), `npm run test:db`, `npm run build`, plus an MCP protocol smoke script (see below).

## Verification

There is no `.env.local`, so a live server against a real database may be impossible. Do what is possible and be explicit about what was not exercised:
- Type-check, lint, build must pass.
- Write a small Node script (`scratchpad`, not committed) that imports the built handler or uses the SDK `Client` with `StreamableHTTPClientTransport` against `next start` if the app can boot; otherwise unit-check the tool registry by calling `tools/list` through the transport with a fake in-memory request (401 path and `tools/list` path need no database if authentication is stubbed). Report precisely which of initialize / tools/list / a tool call were actually exercised.

## Non-goals

OAuth for MCP, MCP resources/prompts, memory write tool, changing the old stdio MCP code, per-key display label for humans/agents.
