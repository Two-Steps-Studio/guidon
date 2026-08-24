# Phase 5 — AI Task API — design

## Context

Investigated before designing: `src/lib/ai/provider.ts` is a real, already-
shipped multi-vendor AI abstraction (Anthropic/OpenAI/OpenRouter/Ollama/
Azure/Custom) used today by `projects/[id]/memory`'s "Generate Insight"
feature. `docs/self-hosting-audit.md`'s "AI coupling: nie istnieje" is a
stale snapshot from an earlier point in the project, not current truth —
noted so a future reader doesn't trust that line either.

This phase is a **different** thing: not Guidon calling an LLM provider,
but an **external AI agent (or any script) calling Guidon** over a REST
API to read and work on tasks, authenticated by an API key it holds. The
two don't overlap in code.

Confirmed vocabulary and schema before designing the extension:
- `tasks.status` (`tasks_status_check`, migration 002) is currently
  `backlog | todo | in_progress | review | done` — `review` **already
  exists** and is exactly the "handed back to a human" state the user's
  lifecycle wants. Only one new value is needed: `ai_working`.
- `activity_logs` (baseline schema) has no CHECK constraint on `action` —
  it's plain `text` — so new AI-specific action strings need no migration,
  only a `types/api.ts` union extension.
- `action-config.ts` (`projects/[id]/activity`) already renders whatever
  action strings exist generically — new AI actions there need only a new
  config entry each, not new page/component code.

## Task lifecycle

```
todo/backlog → ai_working → review → done
```

`ai_working → done` directly is only allowed when the project has
explicitly opted in via `projects.allow_ai_auto_complete` (default
`false`, per the user's own explicit requirement) **and** the calling
key's permissions include `can_complete_tasks` (also default `false`).
Otherwise the API always lands on `review`, matching "AI nie powinno
automatycznie oznaczać taska jako completed bez odpowiednich uprawnień."

## Schema

New migration `016_ai_task_api.sql`:

```sql
ALTER TABLE public.tasks DROP CONSTRAINT tasks_status_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_status_check
    CHECK (status IN ('backlog','todo','in_progress','ai_working','review','done'));

ALTER TABLE public.projects ADD COLUMN allow_ai_auto_complete boolean NOT NULL DEFAULT false;

CREATE TABLE public.project_ai_permissions (
    project_id            uuid PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    can_read_context      boolean NOT NULL DEFAULT true,
    can_create_comments   boolean NOT NULL DEFAULT true,
    can_change_status     boolean NOT NULL DEFAULT true,
    can_complete_tasks    boolean NOT NULL DEFAULT false,
    can_modify_settings   boolean NOT NULL DEFAULT false,
    can_delete_tasks      boolean NOT NULL DEFAULT false,
    updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.api_keys (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name              text NOT NULL CHECK (length(trim(name)) > 0),
    key_prefix        text NOT NULL,   -- first 12 chars, shown in the UI after creation
    key_hash          text NOT NULL UNIQUE,  -- sha256, hex
    scopes            text[] NOT NULL DEFAULT '{}',
    created_at        timestamptz NOT NULL DEFAULT now(),
    last_used_at      timestamptz,
    revoked_at        timestamptz
);
```

Scopes vocabulary (matches the user's own list exactly): `tasks:read`,
`tasks:write`, `tasks:status`, `projects:read`, `context:read`,
`comments:write`.

**`project_ai_permissions`'s defaults intentionally mirror the user's own
checklist** (item 19): read/comment/status-change on by default,
complete/modify-settings/delete-tasks off — "najbardziej niebezpieczne
akcje powinny być domyślnie wyłączone," in the schema, not just the UI.

**RLS**: `project_ai_permissions` — `SELECT`/`UPDATE` for
`owner`/`admin` project roles (mirrors `projects_update`'s own role check),
consistent with this being project configuration, not a security boundary
in itself (the boundary is scopes + the API auth layer below). `api_keys`
— `SELECT`/`INSERT`/`DELETE` where `user_id = auth.uid()` only, **no
`UPDATE` policy at all** — a key is created or revoked, never edited in
place (same "narrower than it looks" instinct as `task_attempts`' no-UPDATE
policy from migration 013). No admin/service_role override needed for
this table; a user's own keys are exactly that.

## Authenticating an API request as its key's owner

The hard problem: once a request presents a valid API key, every
downstream query must run under RLS **as that key's owner** — not as
`service_role` with hand-rolled authorization checks re-implementing what
RLS already enforces everywhere else in this codebase, and not as
`anon`/unauthenticated (which would see nothing).

- **Self-hosted**: trivial — `withUser(userId, ...)` (`src/lib/db/session.ts`)
  already does exactly this for every other server-side identity resolution
  in the codebase. The API key layer resolves `key_hash → user_id` and
  calls `withUser(userId, ...)`, no new mechanism.
- **Hosted (Supabase)**: mint a short-lived (60s) custom JWT with claims
  `{ sub: userId, role: "authenticated", exp }`, signed with
  `SUPABASE_JWT_SECRET` (new required env var for this feature — documented
  in `.env.example`), then create a Supabase client with that token as its
  bearer auth instead of session cookies
  (`createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${jwt}` } } })`).
  PostgREST decodes that JWT the same way it decodes a real GoTrue session
  token, so `auth.uid()` resolves to `userId` and every existing RLS policy
  applies unchanged. Signing reuses the exact HMAC-SHA256-via-`crypto.subtle`
  pattern `src/lib/auth/session-cookie.ts` already implements — no new JWT
  library dependency, matching this codebase's established "stdlib covers
  it" preference.

Both paths converge on one helper, `withApiKeyAuth(apiKey, fn)` in a new
`src/lib/api/api-key-auth.ts`, so route handlers don't need to know which
branch they're on — same shape as `withUser`/`withServiceRole`.

## API key format and hashing

`guidon_` + 32 random bytes, base64url-encoded (`guidon_xxxxxxxxxxxxxxxxx`,
matching the user's own example format). Shown to the user exactly once at
creation time, in the response of the create action — never persisted or
retrievable again. Stored as `key_prefix` (first 12 characters, for the
user to recognize which key is which in the list UI) + `key_hash` (SHA-256
of the full key, hex) — verification hashes the presented key and looks up
by hash, same principle as password hashing (never compare/store
plaintext), simpler than scrypt since this is a high-entropy random token
rather than a user-chosen password (no dictionary-attack surface to slow
down).

## Endpoints

All under `src/app/api/v1/`, all requiring `Authorization: Bearer guidon_...`,
all rate-limited per key (reusing `src/lib/auth/rate-limit.ts`'s existing
in-memory pattern, keyed by `key_hash` instead of email):

| Endpoint | Scope required | Behavior |
|---|---|---|
| `GET /api/v1/projects/:projectId/tasks` | `tasks:read` | Lists tasks in the project (RLS scopes to what the key's owner can see — a project they're not a member of returns 404, not empty, matching this codebase's existing not-found-vs-forbidden convention where checked). |
| `GET /api/v1/tasks/:taskId` | `tasks:read` | Single task. |
| `POST /api/v1/tasks/:taskId/start` | `tasks:status` | `todo`/`backlog` → `ai_working`. Rejects if the task is already past `ai_working` in the lifecycle. Logs `task_ai_started`. |
| `POST /api/v1/tasks/:taskId/complete` | `tasks:status` + `can_complete_tasks` permission + `allow_ai_auto_complete` on the project | `ai_working`/`review` → `done`. Without all three conditions, returns a 403 explaining exactly which is missing, not a generic error. Logs `task_ai_completed`. |
| `PATCH /api/v1/tasks/:taskId/status` | `tasks:status` + `can_change_status` permission | Generic status transition (e.g. explicit move to `review`). Same status vocabulary as the UI's own task update path — no new transition rules invented here beyond the two above. Logs `task_ai_status_changed`. |
| `POST /api/v1/tasks/:taskId/comment` | `comments:write` + `can_create_comments` permission | Adds a task comment (existing `task_comments` table/flow, called via the API instead of the UI). Logs `task_ai_commented`. |

Every endpoint's authorization is layered: (1) valid, non-revoked key →
(2) key has the required scope → (3) the project's
`project_ai_permissions` allows the specific action → (4) RLS (via the
JWT-impersonation/`withUser` layer) confirms the key's owner actually has
project access at all. A key with `tasks:write` but no project membership
gets exactly nothing back — the user's own explicit requirement
("nie pozwalaj zwykłemu użytkownikowi manipulować taskami innego projektu
przez zmianę projectId") is satisfied by RLS itself, not a
manually-written ownership check that could drift from it.

## UI

- **API Keys** — new section on `/profile` (the closest existing "my
  account" page — Guidon has no separate global settings hierarchy today,
  and inventing one just for this is out of scope). Create (name + scope
  checkboxes → shows the full key once, in a copyable, dismiss-once
  banner), list (name, prefix, scopes, created, last used, revoke button),
  revoke (sets `revoked_at`, doesn't delete the row — same "log entry, not
  edited" instinct as `task_attempts`).
- **AI Permissions + auto-complete toggle** — new section on
  `projects/[id]/settings` (existing page), gated to
  `canManageProject(role)` same as the rest of that page. Six checkboxes
  matching `project_ai_permissions` 1:1, plus the separate
  "Allow AI to auto-complete tasks" toggle for `allow_ai_auto_complete`
  (kept visually distinct from the permission checkboxes — it's a
  project-level policy switch, not a scope).
- **AI activity** — no new page. `projects/[id]/activity` already renders
  `activity_logs` generically; `action-config.ts` gets four new entries
  (`task_ai_started`, `task_ai_commented`, `task_ai_status_changed`,
  `task_ai_completed`) with their own icon/label, so AI actions show up
  in the existing feed alongside human ones, labeled distinctly.
- **Kanban board** — a new "AI Working" column between "In Progress" and
  "Review" in `BOARD_COLUMNS` (`src/lib/work/task-board.ts`), so a task an
  agent is actively working reads clearly on the board a human already
  looks at, not just via the API.

## Out of scope

- Retrofitting activity logging onto every other existing human action in
  the codebase (creating a project, editing a decision, etc.) — the user's
  concrete Activity Log ask (item 18) is specifically about AI actions;
  a full audit-log retrofit across the whole app is a separate, much
  larger effort or a candidate for its own future phase.
- A formal RLS security audit of the whole schema — this phase holds
  itself to the lessons already applied (migration 014/015's
  column-grant/no-self-elevation pattern) for everything it adds, but
  auditing the ~20 pre-existing tables is a separate phase.
- Rate-limit tuning/production-grade distributed rate limiting — reuses
  the existing in-memory limiter (`rate-limit.ts`), which is already this
  codebase's answer to "rate limit an auth-adjacent endpoint" (used for
  login attempts) and has the same single-process caveat that implies;
  a Redis-backed limiter is a scaling concern for later, not this phase.
- Task `blocked`/`cancelled` statuses from the user's speculative list —
  not part of the actual AI lifecycle (`todo → ai_working → review →
  done`), and inventing them now would touch the Kanban board/status
  vocabulary for no concrete use this phase needs.
- Webhooks, streaming, or any transport beyond plain request/response
  REST — matches `src/lib/ai/provider.ts`'s own documented scope
  discipline ("no tool-calling, no streaming... that scope only starts
  once a real feature needs it").
