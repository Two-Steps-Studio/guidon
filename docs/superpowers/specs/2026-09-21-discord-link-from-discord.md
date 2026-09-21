# Discord-initiated project linking (`/guidon-link` -> web page -> pick project)

**Status:** approved by user (2026-09-21). Spec and task breakdown in one document. Replaces the OAuth "Connect to Discord" flow and the manual key-paste `/guidon-link`.

## Flow

1. Bot is already installed in the server (unchanged: manual invite link from the Developer Portal, documented in `discord-bot/README.md`).
2. An admin with Manage Server runs `/guidon-link` (no arguments). The bot replies **ephemerally** with a link `${GUIDON_API_URL}/discord/link?token=<token>` and says whether the server is currently linked (via `getLinkByGuild`).
3. The link opens Guidon's `/discord/link`. Not logged in -> normal login redirect (proxy.ts default) and back.
4. The page verifies the token and lists every project where the logged-in user has role owner/admin (grouped by organization), with a warning if this guild is currently linked to some project ("choosing another project moves the server").
5. The user picks a project and confirms. A Server Action re-checks the role (`getProjectAccess` + `canManageProject`), performs the link, and redirects to `/projects/[id]/settings?discordConnected=1`.

## Token

`base64url(JSON payload) + "." + base64url(HMAC-SHA256(payload, AUTH_SECRET))`, payload `{ guildId, guildName, exp }` (no user id: whoever is logged in when clicking confirms), TTL 10 min. Same construction as `src/lib/discord/oauth-state.ts` (read it; reuse the exact signing scheme, `timingSafeEqual`). Signing lives in the bot (`discord-bot/src/link-token.ts`, own copy as with `crypto.ts`, read `AUTH_SECRET` from `config`), verification in the app (`src/lib/discord/guild-link-token.ts`, `server-only`). Verify interoperability with a throwaway script (bot-built output signs, app module verifies, tamper and expiry rejected).

## Link semantics (`src/lib/data/discord-integration.ts`)

Replace `linkDiscordGuildViaOAuth` with `linkDiscordGuildToProject(projectId, userId, guildId, guildName)`:
- Mint the API key exactly as today (scopes `DISCORD_BOT_KEY_SCOPES`, `bot_label = "Discord bot"`, encrypted with `DISCORD_BOT_KEY_INFO`).
- If this `guild_id` is linked to a *different* project, first clear that row's `guild_id`, `guild_name`, `linked_api_key_encrypted`, `linked_by` (keep its `webhook_url_encrypted`), then upsert the chosen project's row with the new guild fields and `guild_name`. `guild_id` is UNIQUE, so the clear must happen before the upsert, inside one transaction on the self-hosted path (`withUser`, sequential queries on the one client is fine inside a single callback). On the Supabase path use sequential calls (clear, then upsert) and, if the upsert fails, surface the error.
- RLS: `discord_integrations_update` requires owner/admin on the row's own project, so clearing the OLD project's row by a user who is only admin on the NEW project would be silently filtered (0 rows) and then hit the UNIQUE violation. Handle explicitly: the old row can only be cleared by someone who can manage that project. If the clear affects 0 rows and the guild is still linked elsewhere, return a clear error ("This server is linked to a project you don't manage; ask an admin of that project to disconnect it first") rather than a raw constraint error. Add a compat test for this RLS behaviour in `tests/db/compat.test.mjs` (new section 26) if it can be expressed at SQL level.
- Check rowcounts (CLAUDE.md bug class): never report success when nothing was written.

New data function `listManageableProjectsForUser(userId)` returning `{ id, name, organizationId, organizationName }[]` for projects where the user's `project_members.role` is owner/admin (capped with `PROJECT_LIST_SAFETY_CAP` from `@/lib/limits`), both DB modes.

## Removals

- `src/app/api/discord/connect/route.ts`, `src/app/api/discord/callback/route.ts`, `src/lib/discord/oauth-state.ts`.
- `DISCORD_CLIENT_ID` block in `.env.example`.
- `linkGuildToProject` in `discord-bot/src/db.ts` (and its `encryptSecret`/import if unused afterwards, and the `API_KEY_INFO` only if nothing else uses it; `getLinkByGuild` still decrypts with it, so it stays).
- Connect/Reconnect button in `src/app/projects/[id]/settings/discord-integration-form.tsx`, replaced by static instructions (`t("discordLinkInstructions")`: run `/guidon-link` in the Discord server; the bot must already be added). Keep the `discordConnected` success banner; the `discordError` handling may stay for errors redirected from the new page.
- Translation keys `discordConnectButton`, `discordReconnect` (all 4 `messages/*.json`), plus new keys for instructions and the new page. All four languages (en, pl, de, es), same key structure.
- `discord-bot/README.md`: replace both linking sections with the new flow; `.env.example`/README mention that the bot's `GUIDON_API_URL` is what the link is built from (check `discord-bot/src/config.ts`; it must be the public URL users open in a browser, say so).
- Update `docs/superpowers/specs/2026-09-17-discord-bot-design.md`? No: leave history alone.

## New/changed files

- `discord-bot/src/link-token.ts`, rewritten `discord-bot/src/commands/link.ts` (no options, `ManageGuild` default permission, ephemeral reply).
- `src/lib/discord/guild-link-token.ts`, `src/app/discord/link/page.tsx` (Server Component; must handle invalid/expired token with a friendly message telling the user to run `/guidon-link` again, and empty project list), `src/app/discord/link/actions.ts` + a small client form component for the picker (radio list + confirm, pending/error states, follows existing UI components in `src/components/ui`).
- Page must NOT be public in `proxy.ts` (default requires a session).
- After the change, `/task-*` commands' "not linked" messages still say to run `/guidon-link` (they do).

## Tasks

1. Token modules (bot + app) + interoperability check (commit).
2. Data layer: `linkDiscordGuildToProject`, `listManageableProjectsForUser`, compat test section for the RLS/move behaviour (commit).
3. Web: page, action, form, i18n, settings-form change, removals of OAuth routes/state/env doc (commit).
4. Bot: new `link.ts`, removal of `linkGuildToProject`, README (commit).
5. Verification: `npx tsc --noEmit` with `discord-bot/node_modules` hidden (Vercel condition, see commit 132cc38), `npm run lint` (baseline must not grow), `npm run test:db`, `npm run build`, `cd discord-bot && npm run build`. No live Discord/DB available: state what was not exercised.

## Non-goals

Bot installation flow, revoking the previous API key on move (existing precedent: reconnect never revoked), single-use tokens, new migration.
