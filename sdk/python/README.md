# guidon-sdk - Python SDK for Guidon

Official Python client for the [Guidon](https://useguidon.com) REST API
(`/api/v1`): projects, tasks, subtasks, comments, attempts, bug reports and
project knowledge (decisions, knowledge sources, roadmap, memory, tech stack).

- Standard library only (`urllib`), no dependencies.
- Python 3.9+.
- Works with Guidon Cloud (`https://useguidon.com`) and self-hosted instances.

## Install

The PyPI release is pending. After publication, install the `guidon-sdk`
distribution; its Python import name remains `guidon`.

```bash
pip install guidon-sdk
```

## Authenticate

Create an API key in Guidon: **Profile -> API keys**. A key acts as you, limited
to the scopes you gave it (`tasks:read`, `tasks:write`, `tasks:status`,
`comments:write`, `attempts:write`, `project:read`, `project:write`,
`reports:write`).

```python
from guidon import Guidon

guidon = Guidon(api_key="guidon_...")          # or set GUIDON_API_KEY
# Self-hosted:
guidon = Guidon(api_key="guidon_...", base_url="https://guidon.example.com")  # or GUIDON_BASE_URL
```

## Usage

```python
project = guidon.projects.list()[0]

columns = guidon.projects.columns(project["id"])        # the board's column keys
todo = guidon.tasks.list(project["id"], status="todo")  # filters applied client-side

task = guidon.tasks.create(project["id"], "Fix the jump", priority="high", status="todo")
guidon.tasks.update(task["id"], description="Feels floaty on 30 Hz monitors")
guidon.tasks.move(task["id"], "in_progress")
guidon.comments.create(task["id"], "Started on this")

sub = guidon.subtasks.create(project["id"], task["id"], "Write a repro")
print(guidon.tasks.context(task["id"]))                 # Markdown working context

guidon.attempts.record(
    task["id"], problem="Jump height varies", approach="Fixed timestep", outcome="partial",
    files_changed=["src/player.gd"],
)

guidon.decisions.create(project["id"], title="Use Godot 4.4", decision_type="technical")
guidon.memory.create(project["id"], content="Builds ship from main only", memory_type="project_rule")
```

| Attribute | Methods |
| --- | --- |
| `projects` | `list()`, `columns(pid)`, `priorities(pid)`, `references(pid)` |
| `tasks` | `list(pid, status=, parent_task_id=)`, `list_page(pid, limit=, cursor=)`, `iter(pid)`, `get`, `create`, `update`, `move`, `delete`, `start`, `complete`, `context` |
| `subtasks` | `list(pid, parent_id)`, `create(pid, parent_id, title, ...)` |
| `comments` | `list(task_id)`, `create(task_id, content)` |
| `attempts` | `list(task_id)`, `record(task_id, problem=, approach=, outcome=, ...)` |
| `reports` | `file(pid, title, files=[(name, bytes, content_type)], ...)` |
| `decisions`, `knowledge`, `roadmap`, `memory`, `technologies` | `list(pid)`, `get(pid, id)`, `create(pid, **fields)`, `update(pid, id, **fields)`, `delete(pid, id)` |
| `request(method, path, query=, json=)` | escape hatch for routes not wrapped yet |

Results are the API's JSON objects as plain `dict`s.

### Idempotency

Every write method takes `idempotency_key=...`, sent as the `Idempotency-Key`
header. Reuse the same key when retrying the same logical write. With a key, the
SDK also retries the write automatically on 429/502/503/504 and network errors.

### Errors

Everything raises `guidon.GuidonError`:

```python
from guidon import GuidonError

try:
    guidon.tasks.move(task_id, "done")
except GuidonError as e:
    print(e.status, e.code, e.message)   # 404 not_found Task not found.
```

- `status`: HTTP status, `0` when no response was received.
- `code`: the server's `code` if it sent one, else derived from the status with
  the server's own table (`invalid_request`, `unauthorized`, `forbidden`,
  `not_found`, `conflict`, `unprocessable`, `rate_limited`, `internal_error`,
  `unavailable`...); or `network_error`, `timeout`, `invalid_response`,
  `missing_api_key`, `invalid_base_url` when there was no usable response.
- `message`: the `error` text from the JSON body (`{"error": "..."}`).
- `hint`, `docs`: the server's "what to do now" and docs link, when sent.
- also `body`, `retry_after`, `request_id`, `method`, `url`.

GET requests are retried (default `max_retries=2`) on 429/502/503/504 and network
errors, honouring `Retry-After`. Writes are retried only with an
`idempotency_key` (then also on 409 `idempotency_in_progress`).

### Pagination

The task list is cursor-paginated (newest first, up to 1000 per page):

```python
for task in guidon.tasks.iter(project_id, page_size=200):   # fetched page by page
    print(task["title"])

page = guidon.tasks.list_page(project_id, limit=100)        # {"tasks": [...], "next_cursor": ...}
while page["next_cursor"]:
    page = guidon.tasks.list_page(project_id, limit=100, cursor=page["next_cursor"])
```

`tasks.list()` fetches every page and returns a list; its `status` and
`parent_task_id` filters run client-side (the API has no server-side filters).
Against a server that doesn't paginate yet, the first page is the whole list.
The other list endpoints return everything in one response (up to 500 items
for the knowledge collections).

## Development

```bash
cd sdk/python
python -m unittest discover -s tests -v   # mock http.server, no network
python -m build                           # needs `pip install build`
```

Links: [Homepage](https://useguidon.com) - [Source](https://github.com/Two-Steps-Studio/guidon/tree/main/sdk/python) - API reference: `https://useguidon.com/openapi.json`

## License

This SDK is licensed under the [MIT License](./LICENSE). This license applies
to the SDK package only, not to the Guidon application or the rest of the
repository.
