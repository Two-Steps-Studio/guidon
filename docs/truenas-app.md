# Guidon Cloud as a TrueNAS app

The hosted product on a TrueNAS NAS, shown under **Apps** like any other
app (start/stop, logs, update), instead of `./scripts/cloud-host.sh`.
Supabase stays the database, auth and file storage; the Cloudflare tunnel
stays the way in ([cloud-hosting.md](./cloud-hosting.md#on-a-home-server-or-nas-truenas---cloudflare-tunnel)).

What changes: **GitHub builds the image** on every push to `main`
(`.github/workflows/docker-image.yml`) and the NAS only pulls it - no
5-10 minute build and no 4 GB of RAM used on the NAS for it.

## Once

1. **Repository variables** (GitHub > the repository > Settings > Secrets and
   variables > Actions > *Variables* tab). These end up in the browser
   bundle, so they are public anyway - never put a secret here:

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | as in `.env.cloud` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | as in `.env.cloud` |
   | `NEXT_PUBLIC_APP_URL` | `https://useguidon.com` |
   | `NEXT_PUBLIC_AUTH_PROVIDERS`, `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`, `NEXT_PUBLIC_POSTHOG_HOST`, `NEXT_PUBLIC_APP_NAME` | optional, as in `.env.cloud` |

2. **First image.** Actions > *Docker image* > Run workflow (later it runs
   by itself after every merge). It ends with
   `ghcr.io/two-steps-studio/guidon:latest`, private like the repository.

3. **Let the NAS pull it.** GitHub > Settings (your account) > Developer
   settings > Personal access tokens > Tokens (classic) > a token with only
   `read:packages`. In TrueNAS: Apps > Configuration > Docker registries
   (the name varies a little between versions) > Add: URI `https://ghcr.io`,
   your GitHub username, the token as the password.

4. **Stop the old stack** so two tunnels don't run at once, in
   `/mnt/Main/guidon`:

   ```bash
   docker compose --env-file .env.cloud -f docker-compose.cloud.yml --profile tunnel down
   ```

   `.env.cloud` and `deploy/` stay where they are - the app reads them.

5. **Install.** Apps > Discover > ⋮ > *Install via YAML*, name `guidon`,
   paste [`deploy/truenas-app.yaml`](../deploy/truenas-app.yaml). If the
   repository isn't at `/mnt/Main/guidon`, change that path (four places).

## Every update

Merge to `main`, wait for *Docker image* to go green (about 10 minutes),
then Apps > guidon > **Update** (or ⋮ > Pull image / restart). Variables in
`.env.cloud` take effect on the next restart; a change to a `NEXT_PUBLIC_*`
repository variable needs a new image (run the workflow).

**Back to an older version:** in the app's YAML replace `:latest` with
`:sha-<commit>` from a previous run of the workflow and save.

## Migrations

Unchanged: Supabase is migrated with `npm run migrate` and the Supabase
connection string, not by the app.
