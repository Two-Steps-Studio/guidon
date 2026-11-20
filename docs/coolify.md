# Guidon Cloud on Coolify

How to run the hosted product (useguidon.com) with [Coolify](https://coolify.io)
instead of `./scripts/cloud-host.sh`: the same Docker image, **Supabase
unchanged** as database, auth and file storage. Coolify adds what the script
does by hand: a build on every push to `main`, HTTPS, environment variables
in a UI, logs, and one-click rollback to the previous build.

Nothing in the app changes for Coolify. It builds the repository's
`Dockerfile`; `docker-compose.cloud.yml` (Caddy, tunnel, cron container) is
not used - Coolify's own proxy and scheduled tasks replace it.

## Where to run it

- **A VPS (recommended):** 4 GB RAM or more (the build needs it), Ubuntu
  24.04, e.g. Hetzner CX22/CX32. Install Coolify with its one-line installer
  from coolify.io. Coolify itself takes about 1 GB of that memory.
- **Not on TrueNAS:** Coolify expects to own Docker on a plain Debian/Ubuntu
  machine. On the NAS keep `./scripts/cloud-host.sh` with the Cloudflare
  tunnel ([cloud-hosting.md](./cloud-hosting.md)).

## Steps

1. **Source.** Coolify > Projects > New > Application > GitHub App (private
   repository) > `Two-Steps-Studio/guidon`, branch `main`.
2. **Build pack: Dockerfile.** Base directory `/`, Dockerfile `/Dockerfile`.
   Port **3000** (Ports Exposes). Leave Ports Mappings empty - Coolify's
   proxy routes to the container, nothing is published on the host.
3. **Domain.** `https://useguidon.com,https://www.useguidon.com`, then set
   the www redirect to non-www (Configuration > Advanced > Redirect). Coolify
   gets the certificates once DNS points at the server.
4. **Environment variables.** Copy every variable from the current
   `.env.cloud` (or Vercel). Tick **Is Build Variable?** for the ones that
   start with `NEXT_PUBLIC_` - they are baked into the browser bundle at build
   time, so a change to them needs a rebuild (Redeploy), not just a restart.
   Do **not** add `DATABASE_URL`: without it the app uses Supabase.
   `GUIDON_DOMAIN` and `TUNNEL_TOKEN` are not needed here.
5. **Health check.** Configuration > Health Checks: path `/api/health`,
   port 3000. A failing build or health check keeps the old container
   serving.
6. **Scheduled tasks** (what the `cron` container did). Configuration >
   Scheduled Tasks, both run inside the app container:

   | Name | Frequency | Command |
   |---|---|---|
   | webhooks | `*/5 * * * *` | `node -e "fetch('http://127.0.0.1:3000/api/cron/webhooks',{headers:{authorization:'Bearer '+process.env.CRON_SECRET}}).then(r=>process.exit(r.ok?0:1))"` |
   | admin-usage | `17 3 * * *` | the same with `admin-usage` instead of `webhooks` |

   Webhook and automation retries fall due 1, 5 and 30 minutes after a
   failure (`src/lib/webhooks/retry.ts`), so every 5 minutes matters.
7. **Deploy**, then point DNS (`A` records for `useguidon.com` and
   `www.useguidon.com`) at the server - or, with Cloudflare proxying, keep the
   orange cloud and set SSL/TLS to *Full (strict)*.
8. **Automatic deploys.** With the GitHub App source, every push to `main`
   builds and replaces the container. Turn on *Preview Deployments* only if
   the server has room for a second build.

## What is different from Caddy

`deploy/guidon.caddy` also limits request bodies on public pages to 1 MB.
Coolify's proxy doesn't; the app's own limits still apply (Server Actions
accept up to 30 MB, `next.config.ts`). Compression and the www redirect are
covered by Next.js and step 3.

## After the move

The checklist in [cloud-hosting.md](./cloud-hosting.md#after-the-move)
applies unchanged: Supabase redirect URLs, OAuth apps, Stripe webhook - only
needed if the domain changes.
