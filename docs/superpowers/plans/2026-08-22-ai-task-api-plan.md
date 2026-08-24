# Phase 5 Implementation Plan: AI Task API

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An external AI agent holding a Guidon API key can list/read tasks, start work, comment, change status, and (only when explicitly allowed) complete a task — authenticated and scoped safely, with the same RLS every other identity in this codebase already goes through.

**Architecture:** Migration adds `ai_working` to the task status vocabulary, `project_ai_permissions`, and `api_keys`. A shared `src/lib/api/` module resolves a bearer key to its owner and lets route handlers run queries as that user (self-hosted: `withUser`; hosted: a short-lived custom JWT signed with `SUPABASE_JWT_SECRET`, reusing `session-cookie.ts`'s HMAC pattern — no new JWT library). Six route handlers under `src/app/api/v1/`. Two UI additions (API Keys on `/profile`, AI Permissions on project settings) and four `action-config.ts` entries so AI activity shows up in the existing project Activity feed.

Spec: `docs/superpowers/specs/2026-08-22-ai-task-api-design.md`

---

### Task 1: Migration `016_ai_task_api.sql`

**Files:**
- Create: `src/db/migrations/016_ai_task_api.sql`

```sql
-- ============================================================
-- GUIDON — MIGRACJA 016
-- AI Task API: status ai_working, api_keys, project_ai_permissions
-- ============================================================
--
-- Uruchomić PO 015.
--
-- Cykl życia taska dla agenta AI: todo/backlog -> ai_working -> review ->
-- done. `review` już istnieje (migracja 002) — jedyny nowy stan to
-- ai_working. `ai_working -> done` bezpośrednio wymaga jednocześnie
-- projects.allow_ai_auto_complete=true I uprawnienia can_complete_tasks —
-- domyślnie oba wyłączone, zgodnie z wprost wyrażonym wymogiem: AI nie
-- oznacza tasków jako ukończone bez wyraźnej zgody.
--
-- api_keys: hash (sha256), nigdy plaintext. Revoke to UPDATE tylko kolumny
-- revoked_at (GRANT UPDATE na tej jednej kolumnie) — właściciel klucza NIE
-- może zmienić scopes/key_hash własnego klucza, ta sama lekcja co
-- project_limit w migracji 014. project_ai_permissions: domyślne wartości
-- dokładnie odzwierciedlają listę użytkownika — read/comment/status wł.,
-- complete/modify/delete wył.
-- ============================================================

BEGIN;


ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_status_check;

ALTER TABLE public.tasks
    ADD CONSTRAINT tasks_status_check
        CHECK (status IN ('backlog', 'todo', 'in_progress', 'ai_working', 'review', 'done'));


ALTER TABLE public.projects
    ADD COLUMN IF NOT EXISTS allow_ai_auto_complete boolean NOT NULL DEFAULT false;


CREATE TABLE IF NOT EXISTS public.project_ai_permissions (
    project_id            uuid        NOT NULL PRIMARY KEY,
    can_read_context      boolean     NOT NULL DEFAULT true,
    can_create_comments   boolean     NOT NULL DEFAULT true,
    can_change_status     boolean     NOT NULL DEFAULT true,
    can_complete_tasks    boolean     NOT NULL DEFAULT false,
    can_modify_settings   boolean     NOT NULL DEFAULT false,
    can_delete_tasks      boolean     NOT NULL DEFAULT false,
    updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.project_ai_permissions
DROP CONSTRAINT IF EXISTS project_ai_permissions_project_id_fkey;

ALTER TABLE public.project_ai_permissions
    ADD CONSTRAINT project_ai_permissions_project_id_fkey
        FOREIGN KEY (project_id)
            REFERENCES public.projects(id)
            ON DELETE CASCADE;


CREATE TABLE IF NOT EXISTS public.api_keys (
    id                uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id           uuid        NOT NULL,
    name              text        NOT NULL CHECK (length(trim(name)) > 0),
    key_prefix        text        NOT NULL,
    key_hash          text        NOT NULL UNIQUE,
    scopes            text[]      NOT NULL DEFAULT '{}',
    created_at        timestamptz NOT NULL DEFAULT now(),
    last_used_at      timestamptz,
    revoked_at        timestamptz
);

ALTER TABLE public.api_keys
DROP CONSTRAINT IF EXISTS api_keys_user_id_fkey;

ALTER TABLE public.api_keys
    ADD CONSTRAINT api_keys_user_id_fkey
        FOREIGN KEY (user_id)
            REFERENCES public.profiles(id)
            ON DELETE CASCADE;


ALTER TABLE public.project_ai_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS project_ai_permissions_select ON public.project_ai_permissions;
CREATE POLICY project_ai_permissions_select
ON public.project_ai_permissions
FOR SELECT
TO authenticated
USING (private.project_access(project_id));

DROP POLICY IF EXISTS project_ai_permissions_insert ON public.project_ai_permissions;
CREATE POLICY project_ai_permissions_insert
ON public.project_ai_permissions
FOR INSERT
TO authenticated
WITH CHECK (private.project_role(project_id) IN ('owner', 'admin'));

DROP POLICY IF EXISTS project_ai_permissions_update ON public.project_ai_permissions;
CREATE POLICY project_ai_permissions_update
ON public.project_ai_permissions
FOR UPDATE
TO authenticated
USING (private.project_role(project_id) IN ('owner', 'admin'))
WITH CHECK (private.project_role(project_id) IN ('owner', 'admin'));


DROP POLICY IF EXISTS api_keys_select ON public.api_keys;
CREATE POLICY api_keys_select
ON public.api_keys
FOR SELECT
TO authenticated
USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS api_keys_insert ON public.api_keys;
CREATE POLICY api_keys_insert
ON public.api_keys
FOR INSERT
TO authenticated
WITH CHECK (user_id = (SELECT auth.uid()));

-- Revoke is an UPDATE of one column (see the GRANT below), not a DELETE —
-- a revoked key stays as a row (name, scopes, history) rather than
-- disappearing, matching task_attempts' (013) "log entry" instinct.
DROP POLICY IF EXISTS api_keys_revoke ON public.api_keys;
CREATE POLICY api_keys_revoke
ON public.api_keys
FOR UPDATE
TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));


GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_ai_permissions TO authenticated;

-- api_keys: authenticated gets SELECT/INSERT freely, but UPDATE only on
-- revoked_at — the RLS policy above says "your own row," this GRANT says
-- "only this column," together closing the gap migration 014 first
-- documented: RLS alone doesn't stop a caller from writing columns a
-- policy's role-check never looks at.
GRANT SELECT, INSERT ON public.api_keys TO authenticated;
GRANT UPDATE (revoked_at) ON public.api_keys TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_ai_permissions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys TO service_role;


COMMIT;
```

- [ ] **Step 1: Write the migration** exactly as above.

- [ ] **Step 2: Add PGlite assertions**

In `tests/db/compat.test.mjs`, after section 15, before the final
`console.log`:

```javascript
// ------------------------------------------------------------------
section("16. AI Task API: status, permissions, api_keys (migracja 016)");

await withUser(A, async () => {
  const task = await db.query(
    "INSERT INTO public.tasks (project_id, title, status) VALUES ($1, 'AI task', 'ai_working') RETURNING id, status",
    [projectId]
  );
  check("ai_working jest dozwolonym statusem", task.rows[0].status === "ai_working", task.rows[0].status);

  const perms = await db.query(
    "INSERT INTO public.project_ai_permissions (project_id) VALUES ($1) RETURNING can_read_context, can_complete_tasks",
    [projectId]
  );
  check(
    "domyslne uprawnienia AI: read wl., complete wyl.",
    perms.rows[0].can_read_context === true && perms.rows[0].can_complete_tasks === false,
    JSON.stringify(perms.rows[0])
  );

  const key = await db.query(
    "INSERT INTO public.api_keys (user_id, name, key_prefix, key_hash, scopes) VALUES ($1, 'CI key', 'guidon_abcd', 'deadbeef', ARRAY['tasks:read']) RETURNING id, key_prefix"
    , [A]
  );
  check("klucz API utworzony", Boolean(key.rows[0].id), JSON.stringify(key.rows[0]));

  const revoke = await db.query(
    "UPDATE public.api_keys SET revoked_at = now() WHERE id = $1 RETURNING revoked_at",
    [key.rows[0].id]
  );
  check("wlasciciel moze odwolac wlasny klucz (revoked_at)", Boolean(revoke.rows[0].revoked_at));

  await expectRejected(
    "wlasciciel NIE moze zmienic scopes wlasnego klucza",
    () => db.query("UPDATE public.api_keys SET scopes = ARRAY['tasks:write'] WHERE id = $1", [key.rows[0].id]),
    /permission denied/i
  );
});

await withUser(B, async () => {
  const { rows } = await db.query("SELECT count(*)::int n FROM public.api_keys");
  check("B nie widzi kluczy API A", rows[0].n === 0, rows[0].n);
});
```

- [ ] **Step 3: Update table/policy counts**

`project_ai_permissions` and `api_keys` add 2 tables and 6 policies
(`project_ai_permissions`: select/insert/update = 3; `api_keys`:
select/insert/update = 3). Update the assertions from `19`/`75` to:

```javascript
  ["21 tabel", "SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='public'", 21],
  ["81 polityki RLS", "SELECT count(*)::int n FROM pg_policies WHERE schemaname='public'", 81],
```

- [ ] **Step 4: Run and fix**

Run: `npm run test:db`
Expected: `0 fail`. If the column-grant revoke test fails with a
different error pattern than `/permission denied/i`, read the actual
Postgres error and adjust the regex the same way earlier migrations in
this session did when a real error message didn't match the first guess.

- [ ] **Step 5: Commit**

```bash
git add src/db/migrations/016_ai_task_api.sql tests/db/compat.test.mjs
git commit -m "Add AI Task API schema: ai_working status, api_keys, project_ai_permissions"
```

---

### Task 2: Task status vocabulary — `types/task.ts`, `task-board.ts`

**Files:**
- Modify: `src/types/task.ts`
- Modify: `src/lib/work/task-board.ts`

- [ ] **Step 1: Add `ai_working` to `TaskStatus`**

```typescript
export type TaskStatus =
  | "backlog"
  | "todo"
  | "in_progress"
  | "ai_working"
  | "review"
  | "done";
```

- [ ] **Step 2: Add the board column**

In `BOARD_COLUMNS` (`src/lib/work/task-board.ts`), insert a new entry
between `in_progress` and `review`:

```typescript
  {
    status: "ai_working",
    label: "AI Working",
    hint: "An AI agent is working on this",
    accentClass: "bg-info",
  },
```

(`in_progress` already uses `bg-warning` — `ai_working` uses `bg-info`
(blue) to read as visually distinct from a human's own in-progress work,
not implying "blocked/waiting" the way reusing warning would.)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors. Confirmed by grepping the codebase during this
plan's research (`grep -rln '"backlog"' --include=*.ts --include=*.tsx`):
only `types/task.ts` and `task-board.ts` enumerate the status list
literally, so there is no third call site to update.

- [ ] **Step 4: Commit**

```bash
git add src/types/task.ts src/lib/work/task-board.ts
git commit -m "Add ai_working to the task status vocabulary and Kanban board"
```

---

### Task 3: Activity log vocabulary — `types/api.ts`, `action-config.ts`

**Files:**
- Modify: `src/types/api.ts`
- Modify: `src/app/projects/[id]/activity/action-config.ts`

- [ ] **Step 1: Extend `ActivityAction`**

In `src/types/api.ts`, add four values to the `ActivityAction` union
(after the existing `task_status_changed` entry):

```typescript
  | "task_ai_started"
  | "task_ai_commented"
  | "task_ai_status_changed"
  | "task_ai_completed"
```

- [ ] **Step 2: Add config entries**

In `src/app/projects/[id]/activity/action-config.ts`'s `ACTION_CONFIG`
map, add four entries using the `Bot` icon (import it from `lucide-react`
alongside the existing icon imports) and `text-info` (matching the new
Kanban column's color, so AI-sourced activity reads consistently blue
across the app):

```typescript
  task_ai_started: { label: "AI started task", icon: Bot, color: "text-info" },
  task_ai_commented: { label: "AI added comment", icon: Bot, color: "text-info" },
  task_ai_status_changed: { label: "AI changed status", icon: Bot, color: "text-info" },
  task_ai_completed: { label: "AI completed task", icon: Bot, color: "text-success" },
```

(`task_ai_completed` uses `text-success` instead — matches every other
"...completed"/"...approved" terminal-success entry already in this map,
e.g. `decision_approved`.)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/types/api.ts "src/app/projects/[id]/activity/action-config.ts"
git commit -m "Add AI action types to the activity log vocabulary and config"
```

---

### Task 4: API key generation and hashing

**Files:**
- Create: `src/lib/api/api-keys.ts`

- [ ] **Step 1: Write the module**

```typescript
import "server-only";

import { randomBytes, createHash } from "node:crypto";

const KEY_PREFIX = "guidon_";
const PREFIX_DISPLAY_LENGTH = 12;

/** Full key, shown to the user exactly once. Never persisted in plaintext. */
export function generateApiKey(): string {
  return `${KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
}

export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

/** Stored alongside the hash so the UI can show "guidon_ab12..." without ever storing the full key. */
export function keyPrefix(rawKey: string): string {
  return rawKey.slice(0, PREFIX_DISPLAY_LENGTH);
}

export function isValidApiKeyFormat(value: string): boolean {
  return value.startsWith(KEY_PREFIX) && value.length > KEY_PREFIX.length + 20;
}

export const API_KEY_SCOPES = [
  "tasks:read",
  "tasks:write",
  "tasks:status",
  "projects:read",
  "context:read",
  "comments:write",
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/api/api-keys.ts
git commit -m "Add API key generation/hashing utilities"
```

---

### Task 5: API rate limiter

**Files:**
- Create: `src/lib/api/rate-limit.ts`

- [ ] **Step 1: Write the module**

Same shape as `src/lib/auth/rate-limit.ts` (in-memory, per-process,
documented limitation), different constants for request-rate rather than
login-attempt lockout:

```typescript
import "server-only";

/**
 * Per-API-key request rate limit. In-memory, per-process — same
 * documented limitation as src/lib/auth/rate-limit.ts (resets on restart,
 * doesn't share state across replicas); this deployment runs one `app`
 * container (docker-compose.yml), so that's acceptable today. A
 * multi-replica deployment needs a shared store instead.
 */

const MAX_REQUESTS = 60;
const WINDOW_MS = 60 * 1000;

type Window = { count: number; windowStart: number };

const windows = new Map<string, Window>();

function isExpired(entry: Window): boolean {
  return Date.now() - entry.windowStart > WINDOW_MS;
}

export function isRateLimited(apiKeyId: string): boolean {
  const entry = windows.get(apiKeyId);
  if (!entry) return false;

  if (isExpired(entry)) {
    windows.delete(apiKeyId);
    return false;
  }

  return entry.count >= MAX_REQUESTS;
}

export function recordRequest(apiKeyId: string): void {
  const entry = windows.get(apiKeyId);

  if (!entry || isExpired(entry)) {
    windows.set(apiKeyId, { count: 1, windowStart: Date.now() });
    return;
  }

  entry.count += 1;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/api/rate-limit.ts
git commit -m "Add per-API-key rate limiting"
```

---

### Task 6: API key authentication (the JWT-impersonation layer)

**Files:**
- Create: `src/lib/api/api-key-auth.ts`

- [ ] **Step 1: Write the module**

```typescript
import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { hashApiKey, isValidApiKeyFormat } from "./api-keys";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withServiceRole } from "@/lib/db/session";

export interface ApiKeyIdentity {
  userId: string;
  apiKeyId: string;
  scopes: string[];
}

/**
 * Resolves a bearer token to the API key's owner, or null if it's missing,
 * malformed, unknown, or revoked. Updates last_used_at as a side effect —
 * every caller of this function is about to actually use the key, there is
 * no separate "check without using" call site in this codebase.
 */
export async function authenticateApiKey(authHeader: string | null): Promise<ApiKeyIdentity | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;

  const rawKey = authHeader.slice("Bearer ".length).trim();
  if (!isValidApiKeyFormat(rawKey)) return null;

  const keyHash = hashApiKey(rawKey);

  if (hasDirectDatabase()) {
    const result = await withServiceRole(({ query }) =>
      query(
        "SELECT id, user_id, scopes FROM api_keys WHERE key_hash = $1 AND revoked_at IS NULL",
        [keyHash]
      )
    );
    const key = result.rows[0] as { id: string; user_id: string; scopes: string[] } | undefined;
    if (!key) return null;

    await withServiceRole(({ query }) =>
      query("UPDATE api_keys SET last_used_at = now() WHERE id = $1", [key.id])
    );
    return { userId: key.user_id, apiKeyId: key.id, scopes: key.scopes };
  }

  const { createServiceClient } = await import("@/lib/supabase-server");
  const supabase = createServiceClient();

  const { data: key } = await supabase
    .from("api_keys")
    .select("id, user_id, scopes")
    .eq("key_hash", keyHash)
    .is("revoked_at", null)
    .single();

  if (!key) return null;

  await supabase.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id);
  return { userId: key.user_id, apiKeyId: key.id, scopes: key.scopes };
}

/**
 * A Supabase client that operates under RLS as `userId` — for the hosted
 * path only (self-hosted route handlers call withUser(userId, ...)
 * directly instead, the same mechanism every other identity in this
 * codebase already uses; there is nothing for this function to do there).
 *
 * Mints a short-lived (60s) custom JWT with the same claim shape GoTrue's
 * own session tokens carry ({ sub, role: "authenticated", exp }), signed
 * with SUPABASE_JWT_SECRET. PostgREST decodes it exactly like a real
 * session token, so auth.uid() resolves to userId and every existing RLS
 * policy applies unchanged — no authorization logic is reimplemented here.
 */
export async function getApiUserClient(userId: string) {
  const jwt = await signApiJwt(userId);

  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}

const JWT_TTL_SECONDS = 60;

async function signApiJwt(userId: string): Promise<string> {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    throw new Error("SUPABASE_JWT_SECRET must be set to authenticate API key requests on Guidon Cloud.");
  }

  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    sub: userId,
    role: "authenticated",
    exp: Math.floor(Date.now() / 1000) + JWT_TTL_SECONDS,
  };

  const encoder = new TextEncoder();
  const toBase64Url = (bytes: Uint8Array) => {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };

  const headerB64 = toBase64Url(encoder.encode(JSON.stringify(header)));
  const payloadB64 = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(signingInput));
  const sigB64 = toBase64Url(new Uint8Array(signature));

  return `${signingInput}.${sigB64}`;
}
```

(`signApiJwt` reuses the exact base64url-encoding/HMAC-via-`crypto.subtle`
pattern already in `src/lib/auth/session-cookie.ts` — deliberately
duplicated rather than imported, since that file's `signSession`/
`verifySessionCookie` are shaped around this app's own session cookie
payload (`{sub, exp}` with no `role` claim, no JWT header), not a
standards-shaped JWT GoTrue/PostgREST expects; sharing the low-level
`toBase64Url` helper across two files for one four-line function isn't
worth the indirection.)

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/api/api-key-auth.ts
git commit -m "Add API key authentication with JWT impersonation for the hosted path"
```

---

### Task 7: `.env.example` — document `SUPABASE_JWT_SECRET`

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add the variable**

Read the current file around the existing `SUPABASE_SERVICE_ROLE_KEY`/
`SUPABASE_SESSION_EXPIRY` lines (confirmed present at lines 61/63 during
this plan's research) and add, in the same section:

```
# Required only if you use the AI Task API (src/app/api/v1) on Guidon
# Cloud — signs short-lived JWTs so an API key's requests run under the
# same RLS a real session would. Find it in Supabase: Project Settings →
# API → JWT Settings → JWT Secret. Self-hosted installs never need this.
SUPABASE_JWT_SECRET=your-supabase-jwt-secret
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "Document SUPABASE_JWT_SECRET for the AI Task API"
```

---

### Task 8: The six API routes

**Files:**
- Create: `src/app/api/v1/projects/[projectId]/tasks/route.ts`
- Create: `src/app/api/v1/tasks/[taskId]/route.ts`
- Create: `src/app/api/v1/tasks/[taskId]/start/route.ts`
- Create: `src/app/api/v1/tasks/[taskId]/complete/route.ts`
- Create: `src/app/api/v1/tasks/[taskId]/status/route.ts`
- Create: `src/app/api/v1/tasks/[taskId]/comment/route.ts`

Every route shares the same opening boilerplate (auth, scope check, rate
limit) — write it once as a small shared helper rather than six copies.

- [ ] **Step 1: Shared route guard**

Create `src/lib/api/route-guard.ts`:

```typescript
import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey, type ApiKeyIdentity } from "./api-key-auth";
import { isRateLimited, recordRequest } from "./rate-limit";
import type { ApiKeyScope } from "./api-keys";

/**
 * Runs the common checks every /api/v1 AI Task API route needs, in order:
 * valid key -> not rate-limited -> has the required scope. Returns either
 * the authenticated identity or a ready-to-return NextResponse for the
 * caller to `return` immediately — mirrors requireAuth()/isAuthError() in
 * src/lib/auth/auth-helpers.ts, the existing pattern for "check or bail"
 * in this codebase's API routes.
 */
export async function guardApiRequest(
  request: NextRequest,
  requiredScope: ApiKeyScope
): Promise<ApiKeyIdentity | NextResponse> {
  const identity = await authenticateApiKey(request.headers.get("authorization"));
  if (!identity) {
    return NextResponse.json({ error: "Invalid or missing API key." }, { status: 401 });
  }

  if (isRateLimited(identity.apiKeyId)) {
    return NextResponse.json({ error: "Rate limit exceeded. Try again shortly." }, { status: 429 });
  }
  recordRequest(identity.apiKeyId);

  if (!identity.scopes.includes(requiredScope)) {
    return NextResponse.json(
      { error: `This API key does not have the '${requiredScope}' scope.` },
      { status: 403 }
    );
  }

  return identity;
}

export function isGuardError(result: ApiKeyIdentity | NextResponse): result is NextResponse {
  return result instanceof NextResponse;
}
```

- [ ] **Step 2: `GET /api/v1/projects/:projectId/tasks`**

Create `src/app/api/v1/projects/[projectId]/tasks/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest, isGuardError } from "@/lib/api/route-guard";
import { getApiUserClient } from "@/lib/api/api-key-auth";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";

export async function GET(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const guard = await guardApiRequest(request, "tasks:read");
  if (isGuardError(guard)) return guard;

  const { projectId } = await params;

  if (hasDirectDatabase()) {
    const result = await withUser(guard.userId, ({ query }) =>
      query("SELECT * FROM tasks WHERE project_id = $1 ORDER BY created_at DESC", [projectId])
    );
    return NextResponse.json({ tasks: result.rows });
  }

  const supabase = await getApiUserClient(guard.userId);
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ tasks: data ?? [] });
}
```

(An empty array — not a 404 — is the correct response for a project the
key's owner isn't a member of: RLS returns zero rows either way, and
distinguishing "empty project" from "no access" via a different status
code would leak which project IDs exist to a caller who shouldn't be able
to tell the difference.)

- [ ] **Step 3: `GET /api/v1/tasks/:taskId`**

Create `src/app/api/v1/tasks/[taskId]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest, isGuardError } from "@/lib/api/route-guard";
import { getApiUserClient } from "@/lib/api/api-key-auth";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";

export async function GET(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const guard = await guardApiRequest(request, "tasks:read");
  if (isGuardError(guard)) return guard;

  const { taskId } = await params;

  if (hasDirectDatabase()) {
    const result = await withUser(guard.userId, ({ query }) =>
      query("SELECT * FROM tasks WHERE id = $1", [taskId])
    );
    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Task not found." }, { status: 404 });
    }
    return NextResponse.json({ task: result.rows[0] });
  }

  const supabase = await getApiUserClient(guard.userId);
  const { data, error } = await supabase.from("tasks").select("*").eq("id", taskId).maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Task not found." }, { status: 404 });
  return NextResponse.json({ task: data });
}
```

(A single task by ID legitimately returns 404 rather than an empty
result, unlike the list endpoint above — there's no plural-collection
ambiguity here to hide behind, and the task ID itself was already known
to the caller.)

- [ ] **Step 4: Shared status-transition + activity-log + AI-permission helper**

The `start`/`complete`/`status` routes share enough logic (look up the
task's project, check `project_ai_permissions`, update `tasks.status`, log
to `activity_logs`) to warrant one helper rather than tripling it. Create
`src/lib/api/task-transitions.ts`:

```typescript
import "server-only";

import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { getApiUserClient } from "./api-key-auth";
import type { TaskStatus } from "@/types/task";
import type { ActivityAction } from "@/types/api";

export type TransitionResult =
  | { ok: true; task: Record<string, unknown> }
  | { ok: false; error: string; status: number };

interface ProjectAiPermissions {
  can_change_status: boolean;
  can_complete_tasks: boolean;
}

async function loadProjectContext(
  userId: string,
  taskId: string
): Promise<{ projectId: string; allowAutoComplete: boolean; permissions: ProjectAiPermissions } | null> {
  if (hasDirectDatabase()) {
    return withUser(userId, async ({ query }) => {
      const task = await query("SELECT project_id FROM tasks WHERE id = $1", [taskId]);
      if (task.rows.length === 0) return null;
      const projectId = task.rows[0].project_id as string;

      const project = await query("SELECT allow_ai_auto_complete FROM projects WHERE id = $1", [projectId]);
      const perms = await query(
        "SELECT can_change_status, can_complete_tasks FROM project_ai_permissions WHERE project_id = $1",
        [projectId]
      );

      return {
        projectId,
        allowAutoComplete: project.rows[0]?.allow_ai_auto_complete ?? false,
        permissions: perms.rows[0] ?? { can_change_status: true, can_complete_tasks: false },
      };
    });
  }

  const supabase = await getApiUserClient(userId);

  const { data: task } = await supabase.from("tasks").select("project_id").eq("id", taskId).maybeSingle();
  if (!task) return null;

  const [{ data: project }, { data: perms }] = await Promise.all([
    supabase.from("projects").select("allow_ai_auto_complete").eq("id", task.project_id).maybeSingle(),
    supabase
      .from("project_ai_permissions")
      .select("can_change_status, can_complete_tasks")
      .eq("project_id", task.project_id)
      .maybeSingle(),
  ]);

  return {
    projectId: task.project_id,
    allowAutoComplete: project?.allow_ai_auto_complete ?? false,
    permissions: perms ?? { can_change_status: true, can_complete_tasks: false },
  };
}

async function setStatusAndLog(
  userId: string,
  taskId: string,
  projectId: string,
  newStatus: TaskStatus,
  action: ActivityAction
): Promise<TransitionResult> {
  if (hasDirectDatabase()) {
    return withUser(userId, async ({ query }) => {
      const result = await query("UPDATE tasks SET status = $1 WHERE id = $2 RETURNING *", [newStatus, taskId]);
      await query(
        `INSERT INTO activity_logs (project_id, user_id, action, entity_type, entity_id)
         VALUES ($1, $2, $3, 'task', $4)`,
        [projectId, userId, action, taskId]
      );
      return { ok: true, task: result.rows[0] };
    });
  }

  const supabase = await getApiUserClient(userId);
  const { data, error } = await supabase
    .from("tasks")
    .update({ status: newStatus })
    .eq("id", taskId)
    .select()
    .single();

  if (error) return { ok: false, error: error.message, status: 400 };

  await supabase
    .from("activity_logs")
    .insert({ project_id: projectId, user_id: userId, action, entity_type: "task", entity_id: taskId });

  return { ok: true, task: data };
}

export async function startTask(userId: string, taskId: string): Promise<TransitionResult> {
  const ctx = await loadProjectContext(userId, taskId);
  if (!ctx) return { ok: false, error: "Task not found.", status: 404 };
  if (!ctx.permissions.can_change_status) {
    return { ok: false, error: "AI is not permitted to change task status on this project.", status: 403 };
  }
  return setStatusAndLog(userId, taskId, ctx.projectId, "ai_working", "task_ai_started");
}

export async function completeTask(userId: string, taskId: string): Promise<TransitionResult> {
  const ctx = await loadProjectContext(userId, taskId);
  if (!ctx) return { ok: false, error: "Task not found.", status: 404 };
  if (!ctx.allowAutoComplete) {
    return {
      ok: false,
      error: "This project does not allow AI to auto-complete tasks. Ask a project admin to enable it in Settings.",
      status: 403,
    };
  }
  if (!ctx.permissions.can_complete_tasks) {
    return { ok: false, error: "This API key's AI permissions do not include completing tasks.", status: 403 };
  }
  return setStatusAndLog(userId, taskId, ctx.projectId, "done", "task_ai_completed");
}

export async function setTaskStatus(userId: string, taskId: string, newStatus: TaskStatus): Promise<TransitionResult> {
  const ctx = await loadProjectContext(userId, taskId);
  if (!ctx) return { ok: false, error: "Task not found.", status: 404 };
  if (!ctx.permissions.can_change_status) {
    return { ok: false, error: "AI is not permitted to change task status on this project.", status: 403 };
  }
  if (newStatus === "done" && !(ctx.allowAutoComplete && ctx.permissions.can_complete_tasks)) {
    return {
      ok: false,
      error: "Completing a task requires allow_ai_auto_complete and the can_complete_tasks permission. Use /review instead.",
      status: 403,
    };
  }
  return setStatusAndLog(userId, taskId, ctx.projectId, newStatus, "task_ai_status_changed");
}
```

- [ ] **Step 5: `POST /api/v1/tasks/:taskId/start`**

Create `src/app/api/v1/tasks/[taskId]/start/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest, isGuardError } from "@/lib/api/route-guard";
import { startTask } from "@/lib/api/task-transitions";

export async function POST(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const guard = await guardApiRequest(request, "tasks:status");
  if (isGuardError(guard)) return guard;

  const { taskId } = await params;
  const result = await startTask(guard.userId, taskId);

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ task: result.task });
}
```

- [ ] **Step 6: `POST /api/v1/tasks/:taskId/complete`**

Create `src/app/api/v1/tasks/[taskId]/complete/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest, isGuardError } from "@/lib/api/route-guard";
import { completeTask } from "@/lib/api/task-transitions";

export async function POST(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const guard = await guardApiRequest(request, "tasks:status");
  if (isGuardError(guard)) return guard;

  const { taskId } = await params;
  const result = await completeTask(guard.userId, taskId);

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ task: result.task });
}
```

- [ ] **Step 7: `PATCH /api/v1/tasks/:taskId/status`**

Create `src/app/api/v1/tasks/[taskId]/status/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest, isGuardError } from "@/lib/api/route-guard";
import { setTaskStatus } from "@/lib/api/task-transitions";
import type { TaskStatus } from "@/types/task";

const VALID_STATUSES: TaskStatus[] = ["backlog", "todo", "in_progress", "ai_working", "review", "done"];

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const guard = await guardApiRequest(request, "tasks:status");
  if (isGuardError(guard)) return guard;

  const body = await request.json().catch(() => null);
  const status = body?.status;

  if (typeof status !== "string" || !VALID_STATUSES.includes(status as TaskStatus)) {
    return NextResponse.json(
      { error: `status must be one of: ${VALID_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  const { taskId } = await params;
  const result = await setTaskStatus(guard.userId, taskId, status as TaskStatus);

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ task: result.task });
}
```

- [ ] **Step 8: `POST /api/v1/tasks/:taskId/comment`**

Create `src/app/api/v1/tasks/[taskId]/comment/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest, isGuardError } from "@/lib/api/route-guard";
import { getApiUserClient } from "@/lib/api/api-key-auth";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";

export async function POST(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const guard = await guardApiRequest(request, "comments:write");
  if (isGuardError(guard)) return guard;

  const body = await request.json().catch(() => null);
  const content = typeof body?.content === "string" ? body.content.trim() : "";

  if (!content) {
    return NextResponse.json({ error: "content is required." }, { status: 400 });
  }

  const { taskId } = await params;

  if (hasDirectDatabase()) {
    const result = await withUser(guard.userId, async ({ query }) => {
      const task = await query("SELECT project_id FROM tasks WHERE id = $1", [taskId]);
      if (task.rows.length === 0) return null;

      const perms = await query(
        "SELECT can_create_comments FROM project_ai_permissions WHERE project_id = $1",
        [task.rows[0].project_id]
      );
      if (perms.rows[0] && !perms.rows[0].can_create_comments) return "forbidden";

      const comment = await query(
        `INSERT INTO task_comments (task_id, author_id, content) VALUES ($1, $2, $3) RETURNING *`,
        [taskId, guard.userId, content]
      );
      await query(
        `INSERT INTO activity_logs (project_id, user_id, action, entity_type, entity_id)
         VALUES ($1, $2, 'task_ai_commented', 'task', $3)`,
        [task.rows[0].project_id, guard.userId, taskId]
      );
      return comment.rows[0];
    });

    if (result === null) return NextResponse.json({ error: "Task not found." }, { status: 404 });
    if (result === "forbidden") {
      return NextResponse.json({ error: "AI is not permitted to comment on this project." }, { status: 403 });
    }
    return NextResponse.json({ comment: result });
  }

  const supabase = await getApiUserClient(guard.userId);

  const { data: task } = await supabase.from("tasks").select("project_id").eq("id", taskId).maybeSingle();
  if (!task) return NextResponse.json({ error: "Task not found." }, { status: 404 });

  const { data: perms } = await supabase
    .from("project_ai_permissions")
    .select("can_create_comments")
    .eq("project_id", task.project_id)
    .maybeSingle();

  if (perms && !perms.can_create_comments) {
    return NextResponse.json({ error: "AI is not permitted to comment on this project." }, { status: 403 });
  }

  const { data: comment, error } = await supabase
    .from("task_comments")
    .insert({ task_id: taskId, author_id: guard.userId, content })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await supabase
    .from("activity_logs")
    .insert({ project_id: task.project_id, user_id: guard.userId, action: "task_ai_commented", entity_type: "task", entity_id: taskId });

  return NextResponse.json({ comment });
}
```

- [ ] **Step 9: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 10: Commit**

```bash
git add src/lib/api/route-guard.ts src/lib/api/task-transitions.ts src/app/api/v1/projects src/app/api/v1/tasks
git commit -m "Add the six AI Task API endpoints"
```

---

### Task 9: API Keys UI on `/profile`

**Files:**
- Create: `src/app/profile/api-keys.tsx`
- Create: `src/app/profile/api-keys-actions.ts`
- Modify: `src/app/profile/page.tsx`

- [ ] **Step 1: Server Actions**

Create `src/app/profile/api-keys-actions.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/data/current-user";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { generateApiKey, hashApiKey, keyPrefix, API_KEY_SCOPES } from "@/lib/api/api-keys";

export type ApiKeyRow = {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

export async function listApiKeys(): Promise<ApiKeyRow[]> {
  const user = await getCurrentUser();

  if (hasDirectDatabase()) {
    const result = await withUser(user.id, ({ query }) =>
      query(
        "SELECT id, name, key_prefix, scopes, created_at, last_used_at, revoked_at FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC",
        [user.id]
      )
    );
    return result.rows;
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("api_keys")
    .select("id, name, key_prefix, scopes, created_at, last_used_at, revoked_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (data ?? []) as ApiKeyRow[];
}

export type CreateApiKeyState = { error: string | null; fullKey: string | null };

export async function createApiKey(
  _prevState: CreateApiKeyState,
  formData: FormData
): Promise<CreateApiKeyState> {
  const user = await getCurrentUser();

  const name = formData.get("name");
  if (typeof name !== "string" || !name.trim()) {
    return { error: "Name is required.", fullKey: null };
  }

  const selectedScopes = API_KEY_SCOPES.filter((scope) => formData.get(`scope:${scope}`) === "on");
  if (selectedScopes.length === 0) {
    return { error: "Select at least one scope.", fullKey: null };
  }

  const fullKey = generateApiKey();
  const hash = hashApiKey(fullKey);
  const prefix = keyPrefix(fullKey);

  if (hasDirectDatabase()) {
    await withUser(user.id, ({ query }) =>
      query(
        "INSERT INTO api_keys (user_id, name, key_prefix, key_hash, scopes) VALUES ($1, $2, $3, $4, $5)",
        [user.id, name.trim(), prefix, hash, selectedScopes]
      )
    );
  } else {
    const supabase = await createClient();
    const { error } = await supabase
      .from("api_keys")
      .insert({ user_id: user.id, name: name.trim(), key_prefix: prefix, key_hash: hash, scopes: selectedScopes });

    if (error) return { error: error.message, fullKey: null };
  }

  revalidatePath("/profile");
  return { error: null, fullKey };
}

export async function revokeApiKey(keyId: string): Promise<{ error: string | null }> {
  const user = await getCurrentUser();

  if (hasDirectDatabase()) {
    await withUser(user.id, ({ query }) =>
      query("UPDATE api_keys SET revoked_at = now() WHERE id = $1 AND user_id = $2", [keyId, user.id])
    );
  } else {
    const supabase = await createClient();
    const { error } = await supabase
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", keyId)
      .eq("user_id", user.id);

    if (error) return { error: error.message };
  }

  revalidatePath("/profile");
  return { error: null };
}
```

- [ ] **Step 2: Client component**

Create `src/app/profile/api-keys.tsx`:

```typescript
"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Copy, KeyRound, Trash2 } from "lucide-react";
import { API_KEY_SCOPES } from "@/lib/api/api-keys";
import { createApiKey, revokeApiKey, type ApiKeyRow, type CreateApiKeyState } from "./api-keys-actions";

const initialState: CreateApiKeyState = { error: null, fullKey: null };

export function ApiKeysSection({ initialKeys }: { initialKeys: ApiKeyRow[] }) {
  const [keys, setKeys] = useState(initialKeys);
  const [state, formAction, creating] = useActionState(createApiKey, initialState);
  const [revoking, startRevoke] = useTransition();

  useEffect(() => {
    if (state.fullKey) {
      // A newly created key isn't in `initialKeys` yet (no full page reload
      // happened) — the banner below shows it; the list itself catches up
      // on next navigation via revalidatePath, matching this codebase's
      // existing useActionState + Server Action revalidation pattern.
    }
  }, [state.fullKey]);

  const handleRevoke = (keyId: string) => {
    startRevoke(async () => {
      await revokeApiKey(keyId);
      setKeys((prev) => prev.map((k) => (k.id === keyId ? { ...k, revoked_at: new Date().toISOString() } : k)));
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>API Keys</CardTitle>
        <CardDescription>For AI agents and scripts to access your projects via the API.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {state.fullKey && (
          <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
            <p className="mb-2 font-medium">Copy this key now — it won&apos;t be shown again.</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded bg-background px-2 py-1 font-mono text-xs">
                {state.fullKey}
              </code>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => navigator.clipboard.writeText(state.fullKey!)}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}

        <form action={formAction} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="key-name">Name</Label>
            <Input id="key-name" name="name" placeholder="e.g. Claude Code agent" required />
          </div>
          <div className="space-y-1">
            <Label>Scopes</Label>
            <div className="grid grid-cols-2 gap-2">
              {API_KEY_SCOPES.map((scope) => (
                <label key={scope} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name={`scope:${scope}`} className="h-4 w-4" />
                  {scope}
                </label>
              ))}
            </div>
          </div>
          {state.error && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {state.error}
            </div>
          )}
          <Button type="submit" disabled={creating}>
            <KeyRound className="h-4 w-4 mr-2" />
            {creating ? "Creating..." : "Create API Key"}
          </Button>
        </form>

        <div className="space-y-2">
          {keys.length === 0 && <p className="text-sm text-muted-foreground">No API keys yet.</p>}
          {keys.map((key) => (
            <div key={key.id} className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{key.name}</span>
                  {key.revoked_at && <Badge variant="secondary">Revoked</Badge>}
                </div>
                <p className="font-mono text-xs text-muted-foreground">{key.key_prefix}...</p>
                <p className="text-xs text-muted-foreground">
                  Created {new Date(key.created_at).toLocaleDateString()}
                  {key.last_used_at ? ` · Last used ${new Date(key.last_used_at).toLocaleDateString()}` : " · Never used"}
                </p>
              </div>
              {!key.revoked_at && (
                <Button size="sm" variant="outline" disabled={revoking} onClick={() => handleRevoke(key.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Wire into `/profile/page.tsx`**

Read `src/app/profile/page.tsx`'s current content first (it changed
across Phase 1b's Task 4 — read before editing). Add the import:

```typescript
import { ApiKeysSection } from "./api-keys";
import { listApiKeys } from "./api-keys-actions";
```

Fetch the keys alongside the existing `getCurrentUser()` call (parallelize
with `Promise.all` matching this codebase's established pattern), and
render `<ApiKeysSection initialKeys={apiKeys} />` below the existing
`<ProfileForm user={user} />`, inside the same content container.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/profile/api-keys.tsx src/app/profile/api-keys-actions.ts src/app/profile/page.tsx
git commit -m "Add API key management to the profile page"
```

---

### Task 10: AI Permissions UI on project settings

**Files:**
- Create: `src/app/projects/[id]/settings/ai-permissions-form.tsx`
- Create: `src/app/projects/[id]/settings/ai-permissions-actions.ts`
- Modify: `src/app/projects/[id]/settings/page.tsx`

- [ ] **Step 1: Server Action**

Create `src/app/projects/[id]/settings/ai-permissions-actions.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { canManageProject, getProjectAccess } from "@/lib/data/project-access";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";

export type AiPermissionsState = { error: string | null };

const PERMISSION_FIELDS = [
  "can_read_context",
  "can_create_comments",
  "can_change_status",
  "can_complete_tasks",
  "can_modify_settings",
  "can_delete_tasks",
] as const;

export async function updateAiPermissions(
  projectId: string,
  _prevState: AiPermissionsState,
  formData: FormData
): Promise<AiPermissionsState> {
  const access = await getProjectAccess(projectId);
  if (!access || !canManageProject(access.role)) {
    return { error: "You do not have permission to change AI settings for this project." };
  }

  const values = PERMISSION_FIELDS.map((field) => formData.get(field) === "on");
  const allowAutoComplete = formData.get("allow_ai_auto_complete") === "on";

  if (hasDirectDatabase()) {
    await withUser(access.userId, ({ query }) =>
      query(
        `INSERT INTO project_ai_permissions (project_id, can_read_context, can_create_comments, can_change_status, can_complete_tasks, can_modify_settings, can_delete_tasks, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, now())
         ON CONFLICT (project_id) DO UPDATE SET
           can_read_context = EXCLUDED.can_read_context,
           can_create_comments = EXCLUDED.can_create_comments,
           can_change_status = EXCLUDED.can_change_status,
           can_complete_tasks = EXCLUDED.can_complete_tasks,
           can_modify_settings = EXCLUDED.can_modify_settings,
           can_delete_tasks = EXCLUDED.can_delete_tasks,
           updated_at = now()`,
        [projectId, ...values]
      )
    );
    await withUser(access.userId, ({ query }) =>
      query("UPDATE projects SET allow_ai_auto_complete = $1 WHERE id = $2", [allowAutoComplete, projectId])
    );
  } else {
    const supabase = await createClient();

    const { error: permError } = await supabase.from("project_ai_permissions").upsert({
      project_id: projectId,
      can_read_context: values[0],
      can_create_comments: values[1],
      can_change_status: values[2],
      can_complete_tasks: values[3],
      can_modify_settings: values[4],
      can_delete_tasks: values[5],
      updated_at: new Date().toISOString(),
    });
    if (permError) return { error: permError.message };

    const { error: projError } = await supabase
      .from("projects")
      .update({ allow_ai_auto_complete: allowAutoComplete })
      .eq("id", projectId);
    if (projError) return { error: projError.message };
  }

  revalidatePath(`/projects/${projectId}/settings`);
  return { error: null };
}
```

- [ ] **Step 2: Form component**

Create `src/app/projects/[id]/settings/ai-permissions-form.tsx`:

```typescript
"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, Bot, Check } from "lucide-react";
import { updateAiPermissions, type AiPermissionsState } from "./ai-permissions-actions";

interface AiPermissions {
  can_read_context: boolean;
  can_create_comments: boolean;
  can_change_status: boolean;
  can_complete_tasks: boolean;
  can_modify_settings: boolean;
  can_delete_tasks: boolean;
}

const PERMISSION_LABELS: { field: keyof AiPermissions; label: string }[] = [
  { field: "can_read_context", label: "Read project context" },
  { field: "can_create_comments", label: "Create comments" },
  { field: "can_change_status", label: "Change task status" },
  { field: "can_complete_tasks", label: "Complete tasks" },
  { field: "can_modify_settings", label: "Modify project settings" },
  { field: "can_delete_tasks", label: "Delete tasks" },
];

const initialState: AiPermissionsState = { error: null };

export function AiPermissionsForm({
  projectId,
  permissions,
  allowAutoComplete,
}: {
  projectId: string;
  permissions: AiPermissions;
  allowAutoComplete: boolean;
}) {
  const updateWithId = updateAiPermissions.bind(null, projectId);
  const [state, formAction, saving] = useActionState(updateWithId, initialState);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          AI Permissions
        </CardTitle>
        <CardDescription>What an AI agent using this project&apos;s API keys is allowed to do.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {PERMISSION_LABELS.map(({ field, label }) => (
              <label key={field} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name={field}
                  defaultChecked={permissions[field]}
                  className="h-4 w-4"
                />
                {label}
              </label>
            ))}
          </div>

          <div className="rounded-md border border-border p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                name="allow_ai_auto_complete"
                defaultChecked={allowAutoComplete}
                className="h-4 w-4"
              />
              Allow AI to auto-complete tasks
            </label>
            <p className="mt-1 text-xs text-muted-foreground">
              Without this, AI can move tasks to Review but a human always makes the final call to Done.
            </p>
          </div>

          {state.error && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {state.error}
            </div>
          )}

          <Button type="submit" disabled={saving}>
            <Check className="h-4 w-4 mr-2" />
            {saving ? "Saving..." : "Save AI Settings"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Wire into `settings/page.tsx`**

Add fetching `project_ai_permissions` (defaulting to the same
`{true,true,true,false,false,false}` shape the migration's column
defaults use, for a project that's never had a row written — matches
`getOrgPlanLimits`'s own "fail closed to sane defaults" precedent from
Phase 4) alongside the existing `project`/`technologies` fetch, and render
`<AiPermissionsForm projectId={projectId} permissions={...} allowAutoComplete={project.allow_ai_auto_complete} />`
below the existing `<SettingsForm>`.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add "src/app/projects/[id]/settings/ai-permissions-form.tsx" "src/app/projects/[id]/settings/ai-permissions-actions.ts" "src/app/projects/[id]/settings/page.tsx"
git commit -m "Add AI Permissions settings to the project settings page"
```

---

### Task 11: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite, type-check, lint, build**

```bash
npm run test:db
npm run test:limits
npx tsc --noEmit
npm run lint
npm run build
```

Expected: `test:db`/`test:limits` both `0 fail`. `tsc` clean. `lint` shows
only pre-existing `no-explicit-any` debt — no new errors. `build`
succeeds, including all six new `/api/v1/...` routes and both new UI
sections.

- [ ] **Step 2: Trace the auth layer by reading the final files**

Confirm every route under `src/app/api/v1/tasks` and
`src/app/api/v1/projects` calls `guardApiRequest` before touching any
data, and that `getApiUserClient`/`withUser` are the only ways any of
these routes reach the database — no route should use
`createServiceClient()` directly (that would bypass RLS entirely, exactly
what this phase's design was built to avoid).

- [ ] **Step 3: Manual/curl check, if a working backend is reachable**

Same constraint as every prior plan this session — no live Supabase/local
credentials here. If a real environment is available: create an API key
on `/profile`, then:

```bash
curl -H "Authorization: Bearer guidon_..." https://your-instance/api/v1/projects/<id>/tasks
```

confirm a 401 with no header, a 403 with a key lacking `tasks:read`, and a
200 with the right scope — and confirm a key's owner who isn't a member of
the target project gets an empty list, not another user's tasks.
