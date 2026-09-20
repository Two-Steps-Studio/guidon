# Discord Bot Attribution + Per-Command Roles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bot-originated Discord actions (task comments, status changes) display as "Discord bot" instead of the human who ran the OAuth connect flow, and `/task`'s four subcommands become four separate Discord commands so a server admin can grant them to different roles using Discord's own per-command permission screen.

**Architecture:** A new nullable `bot_label` column on `api_keys`, set once when `linkDiscordGuildViaOAuth` mints the Discord bot's key, rides through `authenticateApiKey()` into every `/api/v1` request as `ApiKeyIdentity.botLabel`. The two write paths that currently attribute writes to `guard.userId` (the comment route, and `task-transitions.ts`'s status-change path) additionally stamp a new `actor_label` column on `task_comments`/`activity_logs` with that label. The real `author_id`/`user_id` columns are untouched — they remain the actual RLS/audit identity. Rendering code prefers `actor_label` when present. Separately, `discord-bot/`'s single `/task` command (4 subcommands) is split into 4 top-level commands so Discord's native per-guild command-permission UI can gate them individually.

**Tech Stack:** PostgreSQL migration (`src/db/migrations/`), Next.js Server Actions/route handlers (existing `/api/v1` layer), the standalone `discord-bot/` TypeScript package (discord.js).

This is this repo's real verification stack, not a generic template: `npx tsc --noEmit`, `npm run lint`, `npm run test:db` (a plain Node script against PGlite — no Jest/Vitest, see `CLAUDE.md`). There is no component/unit test runner for the TypeScript logic, so those changes are verified by `tsc`+`lint`+manual code reading, matching how every other Server Action in this codebase is verified.

---

### Task 1: Migration 036 — the three new columns

**Files:**
- Create: `src/db/migrations/036_bot_action_labels.sql`
- Modify: `src/db/migrations/README.md` (append a row to the migrations table)
- Modify: `tests/db/compat.test.mjs` (new section 25)

- [ ] **Step 1: Write the migration**

Create `src/db/migrations/036_bot_action_labels.sql`:

```sql
-- ============================================================
-- GUIDON - MIGRACJA 036
-- Discord bot: etykieta pochodzenia akcji (bot vs czlowiek)
-- ============================================================
--
-- Uruchomic PO 035.
--
-- Cel: dzialania/komentarze wykonane przez discord-bot/ przez /api/v1
-- (kluczem z linkDiscordGuildViaOAuth, src/lib/data/discord-integration.ts)
-- dzis wygladaja jak dzialania osoby, ktora polaczyla serwer z projektem -
-- jej user_id/author_id trafia do activity_logs/task_comments i UI pokazuje
-- jej imie. api_keys.user_id / task_comments.author_id / activity_logs.user_id
-- ZOSTAJA bez zmian - to jest realna podstawa RLS (WITH CHECK sprawdza
-- faktyczna role tej osoby w projekcie) i realny log audytowy "czyj klucz
-- tego uzyl". Te trzy nowe kolumny to WYLACZNIE etykieta do WYSWIETLENIA,
-- ustawiana tylko gdy zapytanie przyszlo przez klucz API oznaczony jako
-- nalezacy do bota (api_keys.bot_label) - NULL wszedzie indziej, czyli
-- dokladnie dzisiejsze zachowanie.
--
-- Brak nowych polityk RLS: trzy zwykle nullable kolumny na istniejacych
-- tabelach, objete istniejacymi GRANTami (api_keys' kolumnowy
-- GRANT UPDATE (revoked_at) nie ogranicza INSERT, ktory jest table-level).
-- ============================================================

BEGIN;


ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS bot_label text;
ALTER TABLE public.task_comments ADD COLUMN IF NOT EXISTS actor_label text;
ALTER TABLE public.activity_logs ADD COLUMN IF NOT EXISTS actor_label text;


COMMIT;
```

- [ ] **Step 2: Register the migration in the README index**

In `src/db/migrations/README.md`, add a row immediately after the `035_discord_integration.sql` row (currently the last row of the table, right before the `## The compatibility layer runs before all of this` heading):

```markdown
| `036_bot_action_labels.sql` | Adds `api_keys.bot_label`, `task_comments.actor_label`, `activity_logs.actor_label` (all nullable `text`, no new RLS). `linkDiscordGuildViaOAuth` (`src/lib/data/discord-integration.ts`) sets `bot_label = 'Discord bot'` on the key it mints; `authenticateApiKey()` surfaces it as `ApiKeyIdentity.botLabel`; the comment route and `task-transitions.ts` stamp it onto `actor_label` so bot-originated comments/status-changes display as "Discord bot" instead of the human who ran the OAuth connect flow — `author_id`/`user_id` themselves are untouched (still the real RLS/audit identity). | Discord bot comments/status changes showing as "Discord bot" instead of a specific person's name |
```

- [ ] **Step 3: Add the compat-test section**

In `tests/db/compat.test.mjs`, insert a new section between the end of section 24 (right after the last `check("webhook nietkniety po probie B", ...)` block, before the final `console.log(`\n  ${pass} pass / ${fail} fail\n`); process.exit(fail ? 1 : 0);` at the very end of the file):

```js
// ------------------------------------------------------------------
section("25. etykieta pochodzenia akcji bota: api_keys.bot_label / task_comments.actor_label / activity_logs.actor_label (migracja 036)");

let botTestTaskId;
await withUser(A, async () => {
  const { rows } = await db.query(
    "INSERT INTO public.tasks (project_id, title) VALUES ($1, 'Task dla testu bot_label') RETURNING id",
    [projectId]
  );
  botTestTaskId = rows[0].id;
});

await withUser(A, async () => {
  const { rows } = await db.query(
    `INSERT INTO public.api_keys (user_id, name, key_prefix, key_hash, scopes, bot_label)
     VALUES ($1, 'Discord bot (test)', 'gdn_test', 'hash-bot-label-test', '{tasks:read}', 'Discord bot')
     RETURNING bot_label`,
    [A]
  );
  check("api_keys.bot_label zapisuje sie i odczytuje", rows[0]?.bot_label === "Discord bot", JSON.stringify(rows));
});

await withUser(A, async () => {
  const { rows } = await db.query(
    `INSERT INTO public.task_comments (task_id, author_id, content, actor_label)
     VALUES ($1, $2, 'Skomentowane przez bota', 'Discord bot')
     RETURNING actor_label`,
    [botTestTaskId, A]
  );
  check(
    "task_comments.actor_label zapisuje sie i odczytuje",
    rows[0]?.actor_label === "Discord bot",
    JSON.stringify(rows)
  );
});

await withUser(A, async () => {
  const { rows } = await db.query(
    `INSERT INTO public.activity_logs (project_id, user_id, action, entity_type, entity_id, actor_label)
     VALUES ($1, $2, 'task_ai_commented', 'task', $3, 'Discord bot')
     RETURNING actor_label`,
    [projectId, A, botTestTaskId]
  );
  check(
    "activity_logs.actor_label zapisuje sie i odczytuje",
    rows[0]?.actor_label === "Discord bot",
    JSON.stringify(rows)
  );
});

await withUser(A, async () => {
  const { rows } = await db.query(
    `INSERT INTO public.task_comments (task_id, author_id, content)
     VALUES ($1, $2, 'Zwykly komentarz czlowieka')
     RETURNING actor_label`,
    [botTestTaskId, A]
  );
  check(
    "actor_label domyslnie NULL - zwykle ludzkie akcje nietkniete",
    rows[0]?.actor_label === null,
    JSON.stringify(rows)
  );
});
```

- [ ] **Step 4: Run the DB compat suite**

Run: `npm run test:db`
Expected: all prior sections still pass, plus the new section 25's four checks pass. The final line reads `149 pass / 0 fail` (145 existing + 4 new).

- [ ] **Step 5: Commit**

```bash
git add src/db/migrations/036_bot_action_labels.sql src/db/migrations/README.md tests/db/compat.test.mjs
git commit -m "Add migration 036: bot_label/actor_label columns for Discord bot attribution"
```

---

### Task 2: Thread `botLabel` through API key authentication

**Files:**
- Modify: `src/lib/api/api-key-auth.ts`
- Modify: `src/lib/data/discord-integration.ts`

- [ ] **Step 1: Add `botLabel` to `ApiKeyIdentity` and select `bot_label`**

In `src/lib/api/api-key-auth.ts`, change the interface:

```ts
export interface ApiKeyIdentity {
  userId: string;
  apiKeyId: string;
  scopes: string[];
  botLabel: string | null;
}
```

Replace the `hasDirectDatabase()` branch inside `authenticateApiKey`:

```ts
  if (hasDirectDatabase()) {
    const result = await withServiceRole(({ query }) =>
      query(
        "SELECT id, user_id, scopes, bot_label FROM api_keys WHERE key_hash = $1 AND revoked_at IS NULL",
        [keyHash]
      )
    );
    const key = result.rows[0] as
      | { id: string; user_id: string; scopes: string[]; bot_label: string | null }
      | undefined;
    if (!key) return null;

    after(() =>
      withServiceRole(({ query }) =>
        query("UPDATE api_keys SET last_used_at = now() WHERE id = $1", [key.id])
      )
    );
    return { userId: key.user_id, apiKeyId: key.id, scopes: key.scopes, botLabel: key.bot_label };
  }
```

Replace the Supabase branch below it:

```ts
  const { data: key } = await supabase
    .from("api_keys")
    .select("id, user_id, scopes, bot_label")
    .eq("key_hash", keyHash)
    .is("revoked_at", null)
    .single();

  if (!key) return null;

  after(() => supabase.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id));
  return { userId: key.user_id, apiKeyId: key.id, scopes: key.scopes, botLabel: key.bot_label };
```

- [ ] **Step 2: Set `bot_label` when minting the Discord bot's key**

In `src/lib/data/discord-integration.ts`, inside `linkDiscordGuildViaOAuth`, change the self-hosted branch's `INSERT INTO api_keys`:

```ts
      await query(
        `INSERT INTO api_keys (user_id, name, key_prefix, key_hash, scopes, bot_label)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, keyName, prefix, hash, DISCORD_BOT_KEY_SCOPES, "Discord bot"]
      );
```

And the Supabase branch's insert:

```ts
  const { error: keyError } = await supabase.from("api_keys").insert({
    user_id: userId,
    name: keyName,
    key_prefix: prefix,
    key_hash: hash,
    scopes: DISCORD_BOT_KEY_SCOPES,
    bot_label: "Discord bot",
  });
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (`ApiKeyIdentity.botLabel` is a new required field — every object literal returned as `ApiKeyIdentity` was updated above, so no call site is left constructing a stale shape.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/api/api-key-auth.ts src/lib/data/discord-integration.ts
git commit -m "Set and surface api_keys.bot_label through ApiKeyIdentity"
```

---

### Task 3: Stamp `actor_label` on task status changes

**Files:**
- Modify: `src/lib/api/task-transitions.ts`
- Modify: `src/app/api/v1/tasks/[taskId]/start/route.ts`
- Modify: `src/app/api/v1/tasks/[taskId]/complete/route.ts`
- Modify: `src/app/api/v1/tasks/[taskId]/status/route.ts`

- [ ] **Step 1: Add a `botLabel` parameter to `setStatusAndLog`**

In `src/lib/api/task-transitions.ts`, change the function signature and both branches' `activity_logs` write:

```ts
async function setStatusAndLog(
  userId: string,
  taskId: string,
  projectId: string,
  newStatus: TaskStatus,
  action: ActivityAction,
  botLabel: string | null
): Promise<TransitionResult> {
  if (hasDirectDatabase()) {
    return withUser(userId, async ({ query }) => {
      const result = await query("UPDATE tasks SET status = $1 WHERE id = $2 RETURNING *", [newStatus, taskId]);
      if (result.rows.length === 0) {
        return {
          ok: false,
          error: "This API key's user does not have permission to update this task.",
          status: 403,
        };
      }
      await query(
        `INSERT INTO activity_logs (project_id, user_id, action, entity_type, entity_id, actor_label)
         VALUES ($1, $2, $3, 'task', $4, $5)`,
        [projectId, userId, action, taskId, botLabel]
      );
      const title = (result.rows[0].title as string) ?? "";
      notifyDiscordTaskEvent(
        projectId,
        userId,
        newStatus === "done" ? { kind: "completed", taskId, title } : { kind: "status_changed", taskId, title, status: newStatus }
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

  if (error) {
    if (error.code === "PGRST116") {
      return {
        ok: false,
        error: "This API key's user does not have permission to update this task.",
        status: 403,
      };
    }
    return { ok: false, error: error.message, status: 400 };
  }

  await supabase
    .from("activity_logs")
    .insert({ project_id: projectId, user_id: userId, action, entity_type: "task", entity_id: taskId, actor_label: botLabel });

  const title = (data as { title?: string }).title ?? "";
  notifyDiscordTaskEvent(
    projectId,
    userId,
    newStatus === "done" ? { kind: "completed", taskId, title } : { kind: "status_changed", taskId, title, status: newStatus }
  );

  return { ok: true, task: data };
}
```

(Only the two comments explaining the RLS zero-rows trap and the `PGRST116` reasoning were dropped from this listing for brevity — keep them in the actual file; do not delete existing comments, only change the signature and the two `activity_logs` writes as shown.)

- [ ] **Step 2: Thread `botLabel` through the three exported transition functions**

Replace the three exported functions at the bottom of the same file:

```ts
export async function startTask(userId: string, taskId: string, botLabel: string | null = null): Promise<TransitionResult> {
  const ctx = await loadProjectContext(userId, taskId);
  if (!ctx) return { ok: false, error: "Task not found.", status: 404 };
  if (!ctx.permissions.can_change_status) {
    return { ok: false, error: "AI is not permitted to change task status on this project.", status: 403 };
  }
  return setStatusAndLog(userId, taskId, ctx.projectId, "ai_working", "task_ai_started", botLabel);
}

export async function completeTask(userId: string, taskId: string, botLabel: string | null = null): Promise<TransitionResult> {
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
  return setStatusAndLog(userId, taskId, ctx.projectId, "done", "task_ai_completed", botLabel);
}

export async function setTaskStatus(
  userId: string,
  taskId: string,
  newStatus: TaskStatus,
  botLabel: string | null = null
): Promise<TransitionResult> {
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
  return setStatusAndLog(userId, taskId, ctx.projectId, newStatus, "task_ai_status_changed", botLabel);
}
```

The default `= null` keeps this backward compatible with any caller that doesn't pass a label (there are none today besides the three route handlers below, but this keeps the exported function safe to call with two arguments).

- [ ] **Step 3: Pass `guard.botLabel` from the three route handlers**

In `src/app/api/v1/tasks/[taskId]/start/route.ts`, change:

```ts
  const result = await startTask(guard.userId, taskId, guard.botLabel);
```

In `src/app/api/v1/tasks/[taskId]/complete/route.ts`, change:

```ts
  const result = await completeTask(guard.userId, taskId, guard.botLabel);
```

In `src/app/api/v1/tasks/[taskId]/status/route.ts`, change:

```ts
  const result = await setTaskStatus(guard.userId, taskId, status as TaskStatus, guard.botLabel);
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/task-transitions.ts src/app/api/v1/tasks/[taskId]/start/route.ts src/app/api/v1/tasks/[taskId]/complete/route.ts src/app/api/v1/tasks/[taskId]/status/route.ts
git commit -m "Stamp actor_label on task status-change activity log entries"
```

---

### Task 4: Stamp `actor_label` on bot comments

**Files:**
- Modify: `src/app/api/v1/tasks/[taskId]/comment/route.ts`

- [ ] **Step 1: Pass `guard.botLabel` into both inserts, both branches**

In the `hasDirectDatabase()` branch, change the two inserts inside the `withUser` callback:

```ts
        const comment = await query(
          `INSERT INTO task_comments (task_id, author_id, content, actor_label) VALUES ($1, $2, $3, $4) RETURNING *`,
          [taskId, guard.userId, content, guard.botLabel]
        );
        await query(
          `INSERT INTO activity_logs (project_id, user_id, action, entity_type, entity_id, actor_label)
           VALUES ($1, $2, 'task_ai_commented', 'task', $3, $4)`,
          [task.rows[0].project_id, guard.userId, taskId, guard.botLabel]
        );
```

In the Supabase branch, change the comment insert:

```ts
  const { data: comment, error } = await supabase
    .from("task_comments")
    .insert({ task_id: taskId, author_id: guard.userId, content, actor_label: guard.botLabel })
    .select()
    .single();
```

and the activity log insert right after it:

```ts
  await supabase.from("activity_logs").insert({
    project_id: task.project_id,
    user_id: guard.userId,
    action: "task_ai_commented",
    entity_type: "task",
    entity_id: taskId,
    actor_label: guard.botLabel,
  });
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/v1/tasks/[taskId]/comment/route.ts"
git commit -m "Stamp actor_label on bot-originated task comments"
```

---

### Task 5: Types and SELECT lists for `actor_label`

**Files:**
- Modify: `src/app/projects/[id]/work/actions.ts`
- Modify: `src/lib/data/activity.ts`

- [ ] **Step 1: Add `actor_label` to `work/actions.ts`'s `TaskComment` type and both queries**

Change the type:

```ts
export type TaskComment = {
  id: string;
  task_id: string;
  author_id: string;
  content: string;
  created_at: string;
  actor_label: string | null;
};
```

In `loadComments`, change both the direct-Postgres query and the Supabase `.select(...)`:

```ts
      const result = await withUser(access.userId, ({ query }) =>
        query(
          "SELECT id, task_id, author_id, content, created_at, actor_label FROM task_comments WHERE task_id = $1 ORDER BY created_at ASC",
          [taskId]
        )
      );
```

```ts
  const { data, error } = await supabase
    .from("task_comments")
    .select("id, task_id, author_id, content, created_at, actor_label")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });
```

In `postComment`, change the `RETURNING`/`.select(...)` column lists (the insert itself is unchanged — the human web UI never sets `actor_label`, so it stays `NULL` by column default, exactly today's behavior):

```ts
      const result = await withUser(access.userId, ({ query }) =>
        query(
          `INSERT INTO task_comments (task_id, author_id, content)
           VALUES ($1, $2, $3)
           RETURNING id, task_id, author_id, content, created_at, actor_label`,
          [taskId, access.userId, content.trim()]
        )
      );
```

```ts
  const { data, error } = await supabase
    .from("task_comments")
    .insert({ task_id: taskId, author_id: access.userId, content: content.trim() })
    .select("id, task_id, author_id, content, created_at, actor_label")
    .single();
```

- [ ] **Step 2: Add `actor_label` to `activity.ts`'s `ActivityLogRow` and `getRecentActivity`**

Change the interface:

```ts
export interface ActivityLogRow {
  id: string;
  project_id: string | null;
  organization_id: string | null;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
  actor_label: string | null;
}
```

Change both branches of `getRecentActivity`:

```ts
    const result = await withUser(userId, ({ query }) =>
      query(
        `SELECT id, project_id, organization_id, user_id, action, entity_type, entity_id, details, created_at, actor_label
         FROM activity_logs
         WHERE project_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [projectId, limit]
      )
    );
    return result.rows;
  }

  const supabase = await createClient();

  const { data } = await supabase
    .from("activity_logs")
    .select("id, project_id, organization_id, user_id, action, entity_type, entity_id, details, created_at, actor_label")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(limit);
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/projects/[id]/work/actions.ts" src/lib/data/activity.ts
git commit -m "Add actor_label to TaskComment and ActivityLogRow"
```

---

### Task 6: Render `actor_label` instead of the connecting person's name

**Files:**
- Modify: `src/components/work/task-detail-dialog.tsx`
- Modify: `src/app/projects/[id]/activity/page.tsx`

- [ ] **Step 1: Update the comment list rendering**

In `src/components/work/task-detail-dialog.tsx`, `Bot` is already imported from `lucide-react` (line 4) — no import change needed. Replace the block starting at `{comments.map((comment) => {`:

```tsx
              {comments.map((comment) => {
                const author = membersById.get(comment.author_id);
                const isBot = Boolean(comment.actor_label);

                return (
                  <li key={comment.id} className="group flex gap-2.5">
                    <span
                      aria-hidden
                      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-medium text-secondary-foreground"
                    >
                      {isBot ? <Bot className="h-3.5 w-3.5" /> : author ? initialsFor(author) : "?"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {comment.actor_label || author?.full_name || author?.email || t("unknownAuthor")}
                        </span>
                        {" · "}
                        {new Date(comment.created_at).toLocaleString()}
```

(Everything after `{new Date(comment.created_at).toLocaleString()}` in that block — the decision-marking button etc. — is unchanged; only the two lines producing the avatar content and the display name change.)

- [ ] **Step 2: Update the activity log rendering**

In `src/app/projects/[id]/activity/page.tsx`, change the name line inside the `entries.map((entry) => { ... })` block:

```tsx
                        <span className="font-medium">{entry.actor_label || nameFor(actor, t("someone"))}</span>{" "}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: 26 problems (same pre-existing baseline as before this feature — see `git log`'s "Parallelize independent queries/calls (perf audit round 3)" commit for the confirmed baseline), none of them in the files touched by this plan.

- [ ] **Step 5: Run the DB compat suite one more time**

Run: `npm run test:db`
Expected: `149 pass / 0 fail` (unchanged from Task 1 — this task touches no SQL).

- [ ] **Step 6: Commit**

```bash
git add src/components/work/task-detail-dialog.tsx "src/app/projects/[id]/activity/page.tsx"
git commit -m "Render actor_label (bot attribution) in comments and activity log"
```

---

### Task 7: Split `discord-bot`'s `/task` command into four commands

**Files:**
- Create: `discord-bot/src/commands/task-list.ts`
- Create: `discord-bot/src/commands/task-start.ts`
- Create: `discord-bot/src/commands/task-complete.ts`
- Create: `discord-bot/src/commands/task-comment.ts`
- Delete: `discord-bot/src/commands/task.ts`
- Modify: `discord-bot/src/deploy-commands.ts`
- Modify: `discord-bot/src/index.ts`
- Modify: `discord-bot/README.md`

- [ ] **Step 1: Create `task-list.ts`**

```ts
import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { getLinkByGuild } from "../db.js";
import { listTasks, type GuidonTask } from "../guidon-api.js";

export const data = new SlashCommandBuilder()
  .setName("task-list")
  .setDescription("List this server's linked Guidon project's tasks");

function formatTaskList(tasks: GuidonTask[]): string {
  if (tasks.length === 0) return "No tasks in this project.";
  // Discord message bodies cap at 2000 chars - a large board would blow
  // past that fast, so this caps the list rather than truncating mid-line.
  const LIST_LIMIT = 25;
  const lines = tasks
    .slice(0, LIST_LIMIT)
    .map((task) => `\`${task.id.slice(0, 8)}\` **${task.title}** — ${task.status} (${task.priority})`);
  const suffix = tasks.length > LIST_LIMIT ? `\n…and ${tasks.length - LIST_LIMIT} more.` : "";
  return lines.join("\n") + suffix;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const link = await getLinkByGuild(interaction.guildId!);
  if (!link) {
    await interaction.editReply("This server isn't linked to a Guidon project yet - ask an admin to run `/guidon-link` first.");
    return;
  }

  const result = await listTasks(link.apiKey, link.projectId);
  if (!result.ok) {
    await interaction.editReply(`Could not load tasks: ${result.error}`);
    return;
  }
  await interaction.editReply(formatTaskList(result.data.tasks));
}
```

- [ ] **Step 2: Create `task-start.ts`**

```ts
import { SlashCommandBuilder, PermissionFlagsBits, type ChatInputCommandInteraction } from "discord.js";
import { getLinkByGuild } from "../db.js";
import { startTask } from "../guidon-api.js";

export const data = new SlashCommandBuilder()
  .setName("task-start")
  .setDescription("Mark a task as in progress")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption((opt) => opt.setName("task-id").setDescription("Task id").setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const link = await getLinkByGuild(interaction.guildId!);
  if (!link) {
    await interaction.editReply("This server isn't linked to a Guidon project yet - ask an admin to run `/guidon-link` first.");
    return;
  }

  const taskId = interaction.options.getString("task-id", true).trim();
  const result = await startTask(link.apiKey, taskId);
  await interaction.editReply(
    result.ok ? `▶️ **${result.data.task.title}** is now in progress.` : `Could not start that task: ${result.error}`
  );
}
```

- [ ] **Step 3: Create `task-complete.ts`**

```ts
import { SlashCommandBuilder, PermissionFlagsBits, type ChatInputCommandInteraction } from "discord.js";
import { getLinkByGuild } from "../db.js";
import { completeTask } from "../guidon-api.js";

export const data = new SlashCommandBuilder()
  .setName("task-complete")
  .setDescription("Mark a task as done")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption((opt) => opt.setName("task-id").setDescription("Task id").setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const link = await getLinkByGuild(interaction.guildId!);
  if (!link) {
    await interaction.editReply("This server isn't linked to a Guidon project yet - ask an admin to run `/guidon-link` first.");
    return;
  }

  const taskId = interaction.options.getString("task-id", true).trim();
  const result = await completeTask(link.apiKey, taskId);
  await interaction.editReply(
    result.ok ? `✅ **${result.data.task.title}** marked done.` : `Could not complete that task: ${result.error}`
  );
}
```

- [ ] **Step 4: Create `task-comment.ts`**

```ts
import { SlashCommandBuilder, PermissionFlagsBits, type ChatInputCommandInteraction } from "discord.js";
import { getLinkByGuild } from "../db.js";
import { commentOnTask } from "../guidon-api.js";

export const data = new SlashCommandBuilder()
  .setName("task-comment")
  .setDescription("Add a comment to a task")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption((opt) => opt.setName("task-id").setDescription("Task id").setRequired(true))
  .addStringOption((opt) => opt.setName("text").setDescription("Comment text").setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const link = await getLinkByGuild(interaction.guildId!);
  if (!link) {
    await interaction.editReply("This server isn't linked to a Guidon project yet - ask an admin to run `/guidon-link` first.");
    return;
  }

  const taskId = interaction.options.getString("task-id", true).trim();
  const text = interaction.options.getString("text", true);
  const result = await commentOnTask(link.apiKey, taskId, text);
  await interaction.editReply(result.ok ? "💬 Comment added." : `Could not add that comment: ${result.error}`);
}
```

- [ ] **Step 5: Delete the old combined command**

```bash
rm discord-bot/src/commands/task.ts
```

- [ ] **Step 6: Update `deploy-commands.ts`**

Replace the whole file:

```ts
import { REST, Routes } from "discord.js";
import { config } from "./config.js";
import * as link from "./commands/link.js";
import * as webhook from "./commands/webhook.js";
import * as taskList from "./commands/task-list.js";
import * as taskStart from "./commands/task-start.js";
import * as taskComplete from "./commands/task-complete.js";
import * as taskComment from "./commands/task-comment.js";

/**
 * Registers slash commands globally (propagates to every server the bot is
 * in within ~1 hour, per Discord's own caching - the tradeoff for not
 * needing a guild id here). Run once after changing any command's
 * definition: `npm run deploy-commands`. Not run automatically on every
 * bot startup - registering on every restart would hit Discord's global
 * command rate limit needlessly for a set of commands that rarely changes.
 *
 * This is a full overwrite (rest.put replaces Discord's whole command set
 * for this application), not an incremental add - so replacing task.ts's
 * single /task entry with the four /task-* entries below also unregisters
 * the old /task command automatically, no separate cleanup step needed.
 */
const commands = [
  link.data.toJSON(),
  webhook.data.toJSON(),
  taskList.data.toJSON(),
  taskStart.data.toJSON(),
  taskComplete.data.toJSON(),
  taskComment.data.toJSON(),
];

const rest = new REST().setToken(config.discordToken);

const result = (await rest.put(Routes.applicationCommands(config.discordClientId), { body: commands })) as unknown[];

console.log(`Registered ${result.length} application commands.`);
```

- [ ] **Step 7: Update `index.ts`**

Replace the top of the file (imports and the `commands` map — the `Client`/`InteractionCreate` handler below it is unchanged):

```ts
import { Client, Events, GatewayIntentBits, type ChatInputCommandInteraction } from "discord.js";
import { config } from "./config.js";
import * as link from "./commands/link.js";
import * as webhook from "./commands/webhook.js";
import * as taskList from "./commands/task-list.js";
import * as taskStart from "./commands/task-start.js";
import * as taskComplete from "./commands/task-complete.js";
import * as taskComment from "./commands/task-comment.js";

const commands = new Map<string, { execute: (interaction: ChatInputCommandInteraction) => Promise<void> }>([
  [link.data.name, link],
  [webhook.data.name, webhook],
  [taskList.data.name, taskList],
  [taskStart.data.name, taskStart],
  [taskComplete.data.name, taskComplete],
  [taskComment.data.name, taskComment],
]);
```

- [ ] **Step 8: Update `discord-bot/README.md`**

Change line 3-5's intro sentence:

```markdown
Slash commands (`/task-list`, `/task-start`, `/task-complete`, `/task-comment`,
`/guidon-link`, `/guidon-webhook`) against Guidon's existing `/api/v1` (the AI
Task API) - a plain client of that API, same as an AI agent, no new
Guidon-side auth.
```

Change the `npm run deploy-commands` comment (in the "3. Run" section):

```bash
npm run deploy-commands   # registers /task-list, /task-start, /task-complete, /task-comment, /guidon-link, /guidon-webhook with Discord - run once, and again after changing a command
```

Replace the `## Commands` table and the sentence just above the "Not included" paragraph:

```markdown
## Commands

| Command | Does |
|---|---|
| `/guidon-link` | Manual fallback for linking this server to a project (admin only) - prefer the web app's "Connect to Discord" button |
| `/guidon-webhook` | Set the notification webhook for the linked project (admin only) |
| `/task-list` | List the linked project's tasks - open to everyone by default |
| `/task-start <task-id>` | Mark a task in progress - defaults to Manage Server |
| `/task-complete <task-id>` | Mark a task done - defaults to Manage Server |
| `/task-comment <task-id> <text>` | Add a comment to a task - defaults to Manage Server |

`/task-start`, `/task-complete`, and `/task-comment` are separate top-level
commands (not subcommands of one `/task`) specifically so a server admin can
grant or restrict each one to different roles from Discord's own **Server
Settings → Integrations → Guidon** permission screen - Discord only supports
per-role overrides at the whole-command level, not per-subcommand. `/task-list`
has no default restriction; the other three default to requiring **Manage
Server** (same default `/guidon-webhook` already uses) until an admin
reassigns them to specific roles there.

**Not included:** task creation. Guidon's `/api/v1` has no task-creation
endpoint by design (`src/lib/api/scopes.ts`'s own comment documents why) -
adding one is a separate, deliberate decision, not bundled into this bot.
```

- [ ] **Step 9: Build the bot package**

Run: `cd discord-bot && npm run build`
Expected: compiles cleanly to `discord-bot/dist/`, no TypeScript errors. (This is the same verification the earlier `tsx`-not-found fix in this project used — there's no automated test suite in `discord-bot/`.)

- [ ] **Step 10: Commit**

```bash
cd /c/guidon
git add discord-bot/src/commands/task-list.ts discord-bot/src/commands/task-start.ts discord-bot/src/commands/task-complete.ts discord-bot/src/commands/task-comment.ts discord-bot/src/deploy-commands.ts discord-bot/src/index.ts discord-bot/README.md
git add discord-bot/src/commands/task.ts
git commit -m "Split discord-bot's /task command into 4 commands for per-role Discord permissions"
```

(The second `git add` stages the deletion of `task.ts` — `git add` on a removed path stages the removal.)

---

### Task 8: Final full verification

**Files:** none (verification only)

- [ ] **Step 1: Full type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: 26 problems, all pre-existing (none in any file this plan touched).

- [ ] **Step 3: DB compat suite**

Run: `npm run test:db`
Expected: `149 pass / 0 fail`.

- [ ] **Step 4: Production build**

Run: `npm run build`
Expected: builds cleanly, same route list as before this feature (no new routes were added — only existing ones changed).

- [ ] **Step 5: discord-bot build**

Run: `cd discord-bot && npm run build`
Expected: compiles cleanly.

No commit for this task — it's pure verification of the seven commits already made above. If any step fails, fix the regression in the relevant earlier task's files and re-run from Step 1.
