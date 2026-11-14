# Guidon Cloud on one server

How to run the hosted product (useguidon.com) on a small VPS instead of
Vercel: the app in Docker, **Supabase unchanged** as database, auth and file
storage, Caddy for HTTPS. A fixed monthly price and no CPU quota.

This is not self-hosting with your own database - that is
[self-hosting.md](./self-hosting.md) and `./scripts/self-host.sh`.

## What you need

- A server with 4 GB RAM (the build needs it), e.g. Hetzner CX22, Ubuntu 24.04.
- Docker: `curl -fsSL https://get.docker.com | sh`
- The values of the environment variables the Vercel project used.

## Steps

```bash
git clone https://github.com/Two-Steps-Studio/guidon.git && cd guidon
cp .env.cloud.example .env.cloud
nano .env.cloud          # fill in; see the table below
./scripts/cloud-host.sh  # builds (5-10 minutes the first time) and starts
```

Then point DNS at the server: `A` records for `useguidon.com` and
`www.useguidon.com` with the server's IPv4 address (remove the records that
pointed at Vercel). Caddy gets the certificate by itself within a minute.

Update later: `git pull && ./scripts/cloud-host.sh`.

## Where the values come from

| Variable | Source |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET` | Supabase dashboard > Project Settings > API |
| `AUTH_SECRET` | **The same value as before.** It decrypts secrets already saved in the database (organization AI keys, webhook secrets, Discord links). Vercel does not show "sensitive" values again, so take it from where it was first saved (`.env.local`, a password manager). If it is lost, generate a new one with `openssl rand -hex 32` (the script rejects anything under 32 characters); the app works, but those saved secrets must be entered again. |
| `RESEND_API_KEY` | Resend dashboard (create a new key if the old one can't be read) |
| GitHub, Discord, AI, Sentry, PostHog keys | Each provider's dashboard |
| `CRON_SECRET` | Leave empty; the script generates it |
| `MCP_REGISTRY_PUBLIC_KEY` | Printed by `scripts/create-mcp-registry-key.mjs` |

Do not add `DATABASE_URL`: its absence is what selects Supabase.

## After the move

- Supabase > Authentication > URL configuration and the OAuth apps (Google,
  GitHub, Discord) keep working: the domain does not change.
- The Stripe and GitHub webhooks keep working for the same reason.
- The two daily jobs from `vercel.json` (webhook retries, admin usage) run
  from the `cron` container.
- Migrations: Supabase is migrated as before (`npm run migrate` with the
  Supabase connection string), not by this script.
- Logs: `docker compose --env-file .env.cloud -f docker-compose.cloud.yml logs -f app`
