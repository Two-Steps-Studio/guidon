# Discord bot: action attribution + per-command role permissions

**Status:** Approved by user, ready for implementation planning.

## Problem

Two issues with the Discord integration shipped earlier in this project (migration 035, `discord-bot/`, the "Connect to Discord" OAuth flow):

1. **Attribution.** `linkDiscordGuildViaOAuth` (`src/lib/data/discord-integration.ts`) mints a personal API key owned by whichever human clicked "Connect to Discord." Every `/task start|complete|comment` run through that key writes `task_comments.author_id` / `activity_logs.user_id` as that specific person's UUID. The UI resolves that to their name and avatar everywhere comments and activity entries are rendered — so a teammate running `/task complete` from Discord shows up in Guidon as "completed by Marcin" (the person who happened to connect the server), not as a bot action. The user wants bot-originated actions to read as the bot's/organization's action, not a specific person's.

2. **Command permission granularity.** `/task` is one Discord command with four subcommands (`list`, `start`, `complete`, `comment`). Discord's own per-command role-permission system (Server Settings → Integrations → Guidon) only gates whole top-level commands, not individual subcommands — so today a server admin cannot let everyone run `/task list` while restricting `/task complete` to a "Leads" role. The user wants that granularity, using Discord's native permission UI rather than building a new one.

## Non-goals

- No new "service account" / synthetic profile concept. `task_comments.author_id` and `activity_logs.user_id` keep pointing at the real human whose API key was used — that value remains the actual authorization/audit trail (it's what RLS's `WITH CHECK` evaluates). Only the *display* changes.
- No change to `discord_integrations`, the OAuth connect/callback flow, or the webhook notification path (`src/lib/discord/notify.ts`) — those are unaffected by this work.
- No custom in-app Discord-role-to-permission mapping UI. Discord's own per-guild command permission screen is the configuration surface; Guidon only needs to expose finer-grained commands for it to act on.
- `/guidon-webhook` and `/guidon-link` are untouched — only `/task` is split.

## Part 1: Attribution label

### Data model (migration 036)

```sql
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS bot_label text;
ALTER TABLE public.task_comments ADD COLUMN IF NOT EXISTS actor_label text;
ALTER TABLE public.activity_logs ADD COLUMN IF NOT EXISTS actor_label text;
```

All three are nullable, no default, no FK, no new RLS policy — they ride along under each table's existing GRANTs (none of the three tables use column-level GRANT restrictions that would need extending; `api_keys`' existing column-level `GRANT UPDATE (revoked_at)` is unaffected since these are new columns and INSERT there is already table-level for `authenticated`). `NULL` means "shown under the real author's name," exactly today's behavior — so this is a strictly additive, zero-risk-to-existing-rows migration.

`bot_label` lives on `api_keys` (not `discord_integrations`) because attribution needs to travel with *whichever key made the request*, and `authenticateApiKey()` already loads the key row on every `/api/v1` call — no extra query.

### Setting the label

- `linkDiscordGuildViaOAuth` (`src/lib/data/discord-integration.ts`) sets `bot_label = 'Discord bot'` on the `INSERT INTO api_keys` it already does (both the `hasDirectDatabase()` and Supabase branches).
- `ApiKeyIdentity` (`src/lib/api/api-key-auth.ts`) gains `botLabel: string | null`; both `authenticateApiKey()` branches select `bot_label` alongside the existing columns and return it.
- Two write paths propagate it into the new `actor_label` columns, only when `guard.botLabel` is non-null:
  - `src/app/api/v1/tasks/[taskId]/comment/route.ts` — the `INSERT INTO task_comments` (self-hosted) and `.insert(...)` (Supabase) calls add `actor_label: guard.botLabel`. Same for the `activity_logs` insert right after it in that route.
  - `src/lib/api/task-transitions.ts` — `setStatusAndLog` gains a `botLabel: string | null` parameter (threaded through from `startTask`/`completeTask`/`setTaskStatus`, each of which gains the same optional parameter), and includes it on the `INSERT INTO activity_logs` / `.insert(...)` it already performs. The three `/api/v1` route handlers that call these (`tasks/[taskId]/start`, `.../complete`, `.../status`) pass `guard.botLabel`.
- Every other caller of `logActivity()` / the plain comment-posting path (`src/app/projects/[id]/work/actions.ts`'s `postComment`) is unaffected — they never have a `botLabel`, so `actor_label` stays `NULL` for ordinary human actions, which is the existing behavior.

### Rendering

- `src/components/work/task-detail-dialog.tsx` (~line 786): `const author = membersById.get(comment.author_id);` stays, but the name line becomes `comment.actor_label ?? (author?.full_name || author?.email) ?? t("unknownAuthor")`, and the avatar circle shows a bot icon (reuse the `Sparkles` or a `Bot` icon from `lucide-react`, already a project dependency) instead of `initialsFor(author)` when `actor_label` is set.
- `src/app/projects/[id]/activity/page.tsx`: `nameFor()` gains the same precedence — `entry.actor_label ?? nameFor(actor, fallback)`.
- Types: `TaskComment` in `src/app/projects/[id]/work/actions.ts` and `ActivityLogRow` in `src/lib/data/activity.ts` both gain `actor_label: string | null`, and the `SELECT`/`.select()` column lists in `loadComments`/`postComment` (work/actions.ts) and `getRecentActivity` (activity.ts) include it.

## Part 2: Per-command role permissions

Discord's own per-guild command permission screen only discriminates at the top-level command, so `/task`'s four subcommands (`discord-bot/src/commands/task.ts`) become four top-level commands:

| New command | Replaces | Default permission |
|---|---|---|
| `/task-list` | `/task list` | none (open to everyone who can use the bot, same as today) |
| `/task-start` | `/task start` | `PermissionFlagsBits.ManageGuild` (same default `/guidon-webhook` already uses) |
| `/task-complete` | `/task complete` | `PermissionFlagsBits.ManageGuild` |
| `/task-comment` | `/task comment` | `PermissionFlagsBits.ManageGuild` |

A server admin can then loosen or further restrict each command individually to specific roles from Discord's Integrations settings — no Guidon-side config needed.

### Files

- `discord-bot/src/commands/task.ts` is replaced by four files: `task-list.ts`, `task-start.ts`, `task-complete.ts`, `task-comment.ts`, each a `SlashCommandBuilder` + `execute()` pair split out of the current single file's `if (subcommand === ...)` branches. `task-start`/`task-complete`/`task-comment` each call `.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)` on their builder, matching `webhook.ts`'s existing pattern exactly.
- `discord-bot/src/deploy-commands.ts`: the `commands` array's `task.data.toJSON()` entry is replaced by the four new modules' `.data.toJSON()`. Since this uses a bulk `rest.put(Routes.applicationCommands(...))` (a full overwrite, not an incremental add), redeploying automatically unregisters the old `/task` command — no separate cleanup step.
- `discord-bot/src/index.ts`: the `commands` Map gains four entries (one per new module) instead of the single `task` entry.
- `discord-bot/README.md`: update the command list and add a short note that `/task-start`, `/task-complete`, `/task-comment` default to "Manage Server" and can be reassigned to specific roles from the server's Integrations settings.

## Testing

- `tests/db/compat.test.mjs`: extend with cases proving the new `actor_label` columns exist and are nullable/optional (matching this suite's existing per-migration section style), and that inserting a row with `actor_label` set doesn't break any existing RLS policy on `task_comments`/`activity_logs`/`api_keys`. Update the suite's hardcoded table/column-count assertions if any exist for these three tables (same pattern as migrations 034/035 required).
- Manual verification (no live Discord/Supabase credentials in this environment, consistent with how migration 035's bot work was verified): `npx tsc --noEmit`, `npm run lint`, `npm run test:db`, and a standalone script proving `authenticateApiKey()` round-trips `bot_label` correctly for a key inserted with it set.
- `discord-bot`'s command split has no automated test (the package has none today); verify by building (`npm run build`) and running `deploy-commands` against a disposable/test Discord application if the user wants to confirm the actual Discord-side registration before rolling out to the real bot.
