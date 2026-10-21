# @guidon/sdk

Official JavaScript/TypeScript client for the [Guidon](https://useguidon.com)
REST API (`/api/v1`): projects, tasks, subtasks, comments, attempts, bug reports
and project knowledge (decisions, knowledge sources, roadmap, memory, tech stack).

- Zero runtime dependencies - uses the global `fetch` (Node 18+, Deno, Bun, browsers).
- ESM with TypeScript declarations.
- Works with Guidon Cloud (`https://useguidon.com`) and self-hosted instances.

## Install

The npm release is pending. The command below will work after `@guidon/sdk` is published.

```bash
npm install @guidon/sdk
```

## Authenticate

Create an API key in Guidon: **Profile -> API keys**. A key acts as you, limited
to its scopes (`tasks:read`, `tasks:write`, `tasks:status`, `comments:write`,
`attempts:write`, `project:read`, `project:write`, `reports:write`).

```ts
import { Guidon } from "@guidon/sdk";

const guidon = new Guidon({ apiKey: process.env.GUIDON_API_KEY });
// Self-hosted (or set GUIDON_BASE_URL):
const selfHosted = new Guidon({ apiKey: "guidon_...", baseUrl: "https://guidon.example.com" });
```

Under Node, `apiKey` and `baseUrl` fall back to `GUIDON_API_KEY` / `GUIDON_BASE_URL`.

## Usage

```ts
const [project] = await guidon.projects.list();

const columns = await guidon.projects.columns(project.id);
const todo = await guidon.tasks.list(project.id, { status: "todo" });

const task = await guidon.tasks.create(project.id, { title: "Fix the jump", priority: "high" });
await guidon.tasks.update(task.id, { description: "Feels floaty on 30 Hz monitors" });
await guidon.tasks.move(task.id, "in_progress");
await guidon.comments.create(task.id, "Started on this");

await guidon.subtasks.create(project.id, task.id, { title: "Write a repro" });
const markdown = await guidon.tasks.context(task.id);

await guidon.attempts.record(task.id, {
  problem: "Jump height varies",
  approach: "Fixed timestep",
  outcome: "partial",
  files_changed: ["src/player.gd"],
});

await guidon.decisions.create(project.id, { title: "Use Godot 4.4", decision_type: "technical" });
```

| Property | Methods |
| --- | --- |
| `projects` | `list()`, `columns(pid)`, `priorities(pid)`, `references(pid)` |
| `tasks` | `list(pid, { status, parentTaskId })`, `listPage(pid, { limit, cursor })`, `iterate(pid)`, `get`, `create`, `update`, `move`, `delete`, `start`, `complete`, `context` |
| `subtasks` | `list(pid, parentId)`, `create(pid, parentId, input)` |
| `comments` | `list(taskId)`, `create(taskId, content)` |
| `attempts` | `list(taskId)`, `record(taskId, input)` |
| `reports` | `file(pid, { title, files: [{ name, data, type }], ... })` (multipart) |
| `decisions`, `knowledge`, `roadmap`, `memory`, `technologies` | `list(pid)`, `get(pid, id)`, `create(pid, input)`, `update(pid, id, patch)`, `delete(pid, id)` |
| `request(method, path, { query, body })` | escape hatch for routes not wrapped yet |

Every method takes a last `options` argument: `{ signal, timeoutMs, headers }`,
plus `idempotencyKey` on writes.

### Idempotency

Pass `{ idempotencyKey }` to any write; it is sent as the `Idempotency-Key`
header. Reuse the same key when retrying the same logical write. With a key, the
SDK also retries the write automatically on 429/502/503/504 and network errors.

```ts
await guidon.tasks.create(project.id, { title: "Nightly build failed" }, { idempotencyKey: `ci-${runId}` });
```

### Errors

Every failure is a `GuidonError`:

```ts
import { GuidonError } from "@guidon/sdk";

try {
  await guidon.tasks.move(taskId, "done");
} catch (error) {
  if (error instanceof GuidonError) console.error(error.status, error.code, error.message);
}
```

- `status`: HTTP status, `0` when no response was received.
- `code`: the server's `code` if it sent one, else derived from the status with
  the server's own table (`invalid_request`, `unauthorized`, `forbidden`,
  `not_found`, `conflict`, `unprocessable`, `rate_limited`, `internal_error`,
  `unavailable`...); or `network_error`, `timeout`, `aborted`,
  `invalid_response`, `missing_api_key`, `invalid_base_url` when there was no
  usable response.
- `message`: the `error` text of the JSON body (`{ "error": "..." }`).
- `hint`, `docs`: the server's "what to do now" and docs link, when sent.
- also `body`, `retryAfter`, `requestId`, `method`, `url`.

GETs are retried (`maxRetries`, default 2) on 429/502/503/504 and network
errors, honouring `Retry-After`. Writes are retried only with an
`idempotencyKey` (then also on 409 `idempotency_in_progress`).
Default timeout: 30 s (`timeoutMs`).

### Pagination

The task list is cursor-paginated (newest first, up to 1000 per page):

```ts
// Every task, fetched page by page as you go:
for await (const task of guidon.tasks.iterate(projectId, { pageSize: 200 })) console.log(task.title);

// Or one page at a time:
let page = await guidon.tasks.listPage(projectId, { limit: 100 });
while (page.nextCursor) page = await guidon.tasks.listPage(projectId, { limit: 100, cursor: page.nextCursor });
```

`tasks.list()` fetches every page and returns an array; its `status` and
`parentTaskId` filters run client-side (the API has no server-side filters).
Against a server that doesn't paginate yet, the first page is the whole list.
The other list endpoints return everything in one response (up to 500 items
for the knowledge collections).

## Development

```bash
# From the repository root.
npm install
npm run build:sdk   # tsc -> packages/sdk-js/dist/
npm run test:sdk    # build + node:test against a local mock server
```

Links: [Homepage](https://useguidon.com) - [Source](https://github.com/Two-Steps-Studio/guidon/tree/main/packages/sdk-js) - API reference: `https://useguidon.com/openapi.json`

## License

This SDK is licensed under the [MIT License](./LICENSE). This license applies
to the SDK package only, not to the Guidon application or the rest of the
repository.
