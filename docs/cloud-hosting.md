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

## On a home server or NAS (TrueNAS) - Cloudflare Tunnel

A home connection has no open ports (and often no public IPv4), and TrueNAS
keeps 80/443 for its own web UI. A Cloudflare tunnel avoids both: the
`tunnel` container dials out to Cloudflare, Cloudflare serves HTTPS, and no
port is opened on the router. Free.

1. **DNS to Cloudflare.** Cloudflare > Add a site > `useguidon.com` (Free plan).
   It copies the existing records - check the email ones (MX, and the TXT
   records Resend asked for) are there. Then change the nameservers at the
   registrar to the two Cloudflare shows. The domain stays registered where
   it is.
2. **Tunnel.** Cloudflare > Zero Trust > Networks > Tunnels > Create a tunnel
   (Cloudflared). Copy the token from the install command into
   `TUNNEL_TOKEN` in `.env.cloud`. Public hostnames: `useguidon.com` and
   `www.useguidon.com`, both type HTTP, URL `edge:80`. Delete the old records
   that pointed at Vercel if Cloudflare reports a conflict.
3. **TrueNAS 24.10 or newer** (Docker-based apps). Apps > Configuration >
   Choose Pool, if not done yet - Docker only runs then. Create a dataset
   (e.g. `guidon`), open System > Shell, and:

   ```bash
   cd /mnt/<pool>/guidon
   git clone https://github.com/Two-Steps-Studio/guidon.git && cd guidon
   # no git on the NAS? docker run --rm -v "$PWD":/git alpine/git clone https://github.com/Two-Steps-Studio/guidon.git
   cp .env.cloud.example .env.cloud
   nano .env.cloud          # the table below, plus TUNNEL_TOKEN
   sudo ./scripts/cloud-host.sh
   ```

The containers do not appear under Apps; they start again after a reboot.
The build needs about 4 GB of free RAM. Keep in mind the site is down
whenever the NAS, the power or the home internet is.

## Where the values come from

| Variable | Source |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET` | Supabase dashboard > Project Settings > API |
| `AUTH_SECRET` | **The same value as before.** It decrypts secrets already saved in the database (organization AI keys, webhook secrets, Discord links). Vercel does not show "sensitive" values again, so take it from where it was first saved (`.env.local`, a password manager). If it is lost, generate a new one with `openssl rand -hex 32` (the script rejects anything under 32 characters); the app works, but those saved secrets must be entered again. |
| `RESEND_API_KEY` | Resend dashboard (create a new key if the old one can't be read) |
| GitHub, Discord, AI, Sentry, PostHog keys | Each provider's dashboard |
| `CRON_SECRET` | Leave empty; the script generates it |
| `TUNNEL_TOKEN` | Only for the tunnel (section above); empty on a VPS |
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
