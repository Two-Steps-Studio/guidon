# Project events (Context Engine)

Every project keeps an append-only log of what happened in it: tasks, comments, decisions, knowledge sources, files, attempts recorded by AI agents and GitHub commits/PRs linked to tasks. It is the input for the Context Engine and for any integration that wants to follow a project without polling every resource.

## How events are captured

Database triggers write the event in the same transaction as the change (migration `090_context_events.sql`). An event exists if and only if its change was committed, whichever way it was made: the web app, `/api/v1`, MCP, the GitHub webhook or the Discord bot, on Supabase or self-hosted Postgres. Moving a card within its column (`sort_order` only) is not an event.

| `event_type` | `source` | When |
|---|---|---|
| `task.created`, `task.updated`, `task.status_changed`, `task.deleted` | `guidon` | A task or subtask is created, edited, moved to another column or deleted |
| `comment.created`, `comment.updated`, `comment.deleted` | `guidon` | Task comments |
| `decision.*`, `source.*` | `guidon` | Decisions and knowledge sources: created, updated, deleted |
| `file.created`, `file.deleted` | `guidon` | Project files |
| `attempt.recorded` | `agent` | An attempt is recorded on a task (`record_attempt`) |
| `github.commit_linked`, `github.pull_request` | `github` | A commit or PR that references the task was processed |

Deleting a task logs `task.deleted` but not the comments deleted with it. Deleting a project deletes its events.

## Event shape

```json
{
  "id": "0eb830b1-…",
  "seq": 321,
  "organization_id": "…",
  "project_id": "…",
  "source": "guidon",
  "entity_type": "task",
  "entity_id": "855b60b4-…",
  "event_type": "task.status_changed",
  "actor_id": "7e984b24-…",
  "occurred_at": "2026-10-26T12:47:09.074Z",
  "received_at": "2026-10-26T12:47:09.074Z",
  "dedupe_key": "task:855b60b4-…:rev:1",
  "payload": { "from": "backlog", "to": "in_progress", "fields": ["status"] }
}
```

- `organization_id` and `project_id` are derived from the changed row inside the database, never from the request.
- `actor_id` is the signed-in user or API key owner. When the change was made by the service itself, such as the GitHub webhook, it is the row's author, or `null`.
- `payload` holds references only: ids, the names of changed fields, statuses, priorities, attempt outcome. It never contains titles, descriptions, comment text, URLs or secrets. Fetch the entity for its content; access to it is checked as usual.
- `dedupe_key` is unique within the organization. A GitHub redelivery or a repeated backfill adds nothing.

## Reading and replay

`GET /api/v1/projects/{projectId}/events?after=<seq>&limit=<1-500>` (scope `project:read`), MCP tool `list_events`.

- Events come oldest first. `after=0` (the default) replays the whole log.
- Store `cursor` from each answer and pass it as `after` next time. It stays the same when nothing new happened.
- An event whose transaction is still running is not returned until that transaction ends. Because of this, an event that took a lower `seq` but committed later is never skipped by a reader who already passed it.
- Anyone with access to the project can read its events. Nobody can change or delete them, except the service role.

## Limits

- Events are kept for as long as the project exists. There is no retention job yet.
- A transaction left open on the database server delays new events for every reader until it ends.
- Events that existed before migration 090 were backfilled as `*.created` events, marked `"backfilled": true`. Earlier edits were not recorded.
