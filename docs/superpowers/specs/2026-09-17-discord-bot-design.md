# Guidon Discord Bot — Design

## Goal

A Discord bot that lets a team (1) get notified in a channel when task activity
happens in a linked Guidon project, and (2) run a handful of slash commands
against their tasks without leaving Discord.

## Two independent mechanisms

### 1. Outbound notifications — Discord channel webhook, no bot process needed

Discord's native "channel webhook" feature is a plain HTTPS POST URL scoped to
one channel, created in that channel's settings, independent of any bot login.
Guidon's own backend posts to it directly. This means notifications keep
working even if the bot process is down, and needs no new auth mechanism.

- New table `discord_integrations` (migration 035): `project_id`, `guild_id`,
  `webhook_url_encrypted`, `linked_api_key_encrypted`, `linked_by`,
  timestamps. Encrypted with the existing `src/lib/crypto/secret-box.ts`
  (`encryptSecret`/`decryptSecret`, AES-256-GCM keyed from `AUTH_SECRET`) —
  the same mechanism already used for GitHub tokens and org AI provider keys.
  One row per project; a project can only link one Discord destination.
- `notifyDiscordTaskEvent(projectId, event)` (`src/lib/discord/notify.ts`):
  looks up the project's webhook (if any), posts an embed. Called via
  `next/server`'s `after()` — same non-blocking pattern as `logActivity` — from
  the task action functions that actually change state: `createTask`,
  `moveTask` (status change), and the `/api/v1` complete/start/status routes
  (so notifications fire whether the change came from the web UI or an AI
  agent, not just one or the other).
- A small settings UI (`src/app/projects/[id]/settings/discord-integration-form.tsx`)
  to paste/clear the webhook URL — same card style as the existing settings
  page sections.

### 2. Slash commands — a real bot process (`discord-bot/`)

New top-level directory, same shape as `desktop/`: own `package.json`,
`tsconfig.json`, `Dockerfile`, deployed as its own long-running process
(discord.js needs a persistent Gateway connection — this cannot run as a
Next.js API route). It is a pure client of Guidon's existing `/api/v1` (the
AI Task API) — no new Guidon-side auth code, the bot authenticates with a
normal `guidon_...` API key exactly like an AI agent does.

- `/guidon link <api-key>` — admin-only (Discord "Manage Server" permission).
  Validates the key against `GET /api/v1/projects/{projectId}/tasks` (any
  scoped call), then calls a new Guidon Server Action
  (`linkDiscordGuild(projectId, guildId, apiKey)`) that stores the guild↔project
  mapping and the encrypted key server-side. The bot never persists the raw
  key itself — Guidon does, encrypted, same as the webhook URL.
- `/guidon webhook <url>` — sets the notification webhook for the linked
  project (alternative to the settings-page form, for a server admin who
  never opens the web app).
- `/task list` — `GET /api/v1/projects/{projectId}/tasks` (scope `tasks:read`).
- `/task start <id>` — `POST /api/v1/tasks/{taskId}/start` (scope `tasks:status`).
- `/task complete <id>` — `POST /api/v1/tasks/{taskId}/complete` (scope `tasks:status`).
- `/task comment <id> <text>` — `POST /api/v1/tasks/{taskId}/comment` (scope `comments:write`).
- **Deliberately not included:** `/task create`. The AI Task API has no task-creation
  endpoint — `src/lib/api/scopes.ts`'s own comment documents that `tasks:write`
  existed once and was removed because no route needed it, and that a scope
  should only be added once a route actually requires it. Adding creation is a
  real, separate decision (new endpoint + new scope), not a one-line addition
  to the bot — out of scope for this pass, flagged as a natural fast-follow.

Discord's slash-command interactions arrive over the bot's Gateway connection
(discord.js `Client` + `Events.InteractionCreate`), not a webhook Guidon needs
to expose — simplest to build with discord.js's standard bot pattern rather
than the HTTP Interactions Endpoint alternative, which would need a public
HTTPS endpoint with Ed25519 signature verification for no benefit here.

## What the user has to do manually

Registering a Discord Application/Bot (name, icon, bot token, inviting it to
a server with the `applications.commands` + `bot` scopes and "Send Messages"
permission) happens in the Discord Developer Portal — this cannot be
automated from here. `discord-bot/README.md` documents the exact steps and
the required `DISCORD_BOT_TOKEN`/`DISCORD_CLIENT_ID` env vars.

## Out of scope for this pass

- Task creation from Discord (see above).
- Multi-project-per-guild or multi-guild-per-project (today: one row per
  project, `UNIQUE (project_id, guild_id)` still allows a project to link
  multiple guilds if ever needed, but the linking UX only supports one at a
  time).
- Rich embeds beyond a plain title/description/link — polish later.
