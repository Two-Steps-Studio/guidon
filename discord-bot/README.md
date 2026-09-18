# Guidon Discord Bot

Slash commands (`/task-list`, `/task-start`, `/task-complete`, `/task-comment`,
`/guidon-link`, `/guidon-webhook`) against Guidon's existing `/api/v1` (the AI
Task API) - a plain client of that API, same as an AI agent, no new
Guidon-side auth.

Separate from Guidon's own outbound task-event notifications (a plain
Discord channel webhook, configured from the project's Settings page in the
web app - see `docs/superpowers/specs/2026-09-17-discord-bot-design.md`).
This bot is only needed for the interactive slash commands; notifications
work without it.

A long-running process (discord.js needs a persistent Gateway connection),
not a Next.js route - deploy it as its own service, alongside but separate
from the main app.

## 1. Register a Discord Application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) → **New Application**.
2. **Bot** tab → **Reset Token** → copy it (`DISCORD_BOT_TOKEN`). Under
   **Privileged Gateway Intents**, leave everything off - this bot doesn't
   need message content or presence.
3. **General Information** tab → copy the **Application ID** (`DISCORD_CLIENT_ID`).
4. **OAuth2 → URL Generator**: scopes `bot` + `applications.commands`,
   permissions at minimum **Send Messages**. Open the generated URL to
   invite the bot to your server.

## 2. Configure

```bash
cp .env.example .env
# fill in DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID, GUIDON_API_URL, AUTH_SECRET,
# and either DATABASE_URL or NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
```

`AUTH_SECRET` must be the **exact same value** as the main Guidon
deployment's own `AUTH_SECRET` - this bot reads/writes the same encrypted
`discord_integrations` columns the web app does, and both sides derive
their encryption key from it.

`DATABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL`+`SUPABASE_SERVICE_ROLE_KEY`: same
credentials the main Guidon deployment itself uses for direct database
access (self-hosted Postgres vs. Guidon Cloud/Supabase) - this bot reads and
writes `discord_integrations` directly, bypassing RLS, as a trusted
first-party service (the same trust level `scripts/migrate.mjs` already has
in the main repo).

## 3. Run

```bash
npm install
npm run deploy-commands   # registers /task-list, /task-start, /task-complete, /task-comment, /guidon-link, /guidon-webhook with Discord - run once, and again after changing a command
npm run dev                # local development (auto-restarts on change)
npm run build && npm start # production
```

Or via Docker: `docker build -t guidon-discord-bot . && docker run --env-file .env guidon-discord-bot`.

## 4. Link a server to a project

**Recommended: the "Connect to Discord" button** on the project's Settings
page in the web app (requires `DISCORD_CLIENT_ID` set on the *main* Guidon
deployment too - see the main repo's `.env.example`). Click it, pick the
server on Discord's own consent screen, done - Guidon creates a
correctly-scoped API key for you automatically and links the guild, no
copy-pasting a key or a project id anywhere.

**Manual fallback**, if the web app isn't configured for it (or you want a
key with different scopes than the auto-created one): in the Discord
server, an admin (Manage Server permission) runs:

```
/guidon-link api-key:<a Guidon API key> project-id:<the project's id>
```

- The API key comes from Guidon's Profile → API Keys page. It needs the
  `tasks:read`, `tasks:status`, and `comments:write` scopes for every
  `/task` subcommand to work.
- The project id is the UUID in that project's Settings page URL
  (`/projects/<this-id>/settings`).
- **Known limitation:** unlike a key minted by "Connect to Discord" (which
  is stamped `bot_label = 'Discord bot'` so its actions display as the bot's,
  not a person's - see migration 036), a manually pasted personal API key has
  no such label. Comments and status changes made through a manually-linked
  server will show the key owner's name in Guidon's UI, not "Discord bot."
  Prefer "Connect to Discord" when that attribution matters.

Either way, optionally follow up with `/guidon-webhook url:<a Discord
channel webhook URL>` to also receive task-event notifications in that
channel (same effect as setting it from the web app's Settings page).

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
