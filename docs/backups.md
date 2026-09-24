# Backups

There is no built-in scheduled-backup tooling in this repo. This page
describes how an operator backs up a Guidon instance themselves, not a
feature Guidon ships.

## Supabase-hosted (Cloud, or self-hosted without DATABASE_URL)

This applies to Guidon Cloud, and to a self-hosted install that hasn't set
`DATABASE_URL` and is running against a Supabase project instead (see
[self-hosting.md](./self-hosting.md#read-this-first-current-state) for when
each path is actually live - `hasDirectDatabase()` decides per request, and
only one of the two is ever the real data store for a given deployment). If
this is your setup, use Supabase's own backup and point-in-time-recovery
tooling. That's their infrastructure, on their retention/scheduling model;
don't reinvent it here. See Supabase's own documentation for how backups and
PITR are configured for your plan.

If `STORAGE_PROVIDER=supabase`, uploaded files are covered by Supabase's own
Storage, not by anything below.

## Self-hosted PostgreSQL (DATABASE_URL / docker-compose db service)

When `DATABASE_URL` is set, this Postgres instance **is** the live data
store - every page, Server Action, and API route reads and writes through it
(see self-hosting.md's current-state note), not just a schema applied and
left unused. Back it up like you would any production database.

### Docker Compose

The Postgres data lives in the named volume declared in `docker-compose.yml`:

```yaml
volumes:
  guidon-db:
  guidon-storage:
```

Dump it with `pg_dump` run inside the `db` container:

```bash
docker compose exec db pg_dump -U "${POSTGRES_USER:-guidon}" "${POSTGRES_DB:-guidon}" > backup-$(date +%F).sql
```

Restore into a fresh (empty) database:

```bash
cat backup-2026-08-18.sql | docker compose exec -T db psql -U "${POSTGRES_USER:-guidon}" "${POSTGRES_DB:-guidon}"
```

Or back up the volume itself (schema + data, not portable across major
Postgres versions the way a `pg_dump` is):

```bash
docker run --rm -v guidon_guidon-db:/data -v "$PWD":/backup alpine \
  tar czf /backup/guidon-db-$(date +%F).tar.gz -C /data .
```

(Compose prefixes volume names with the project/directory name — check
`docker volume ls` for the exact name on your host if the above doesn't
match.)

### Bare-metal PostgreSQL

Same idea, run directly against whatever `DATABASE_URL` points at:

```bash
pg_dump "$DATABASE_URL" > backup-$(date +%F).sql
```

## Local file storage (`STORAGE_PROVIDER=local`)

Files live under `STORAGE_PATH` — in Docker Compose, the named volume
`guidon-storage` mounted at `/app/storage`. Back up the directory (or
volume) the same way as above:

```bash
# Docker Compose volume
docker run --rm -v guidon_guidon-storage:/data -v "$PWD":/backup alpine \
  tar czf /backup/guidon-storage-$(date +%F).tar.gz -C /data .

# Bare-metal
tar czf guidon-storage-$(date +%F).tar.gz -C "$STORAGE_PATH" .
```

## What's not here

- No scheduled/automated backup job — set one up with cron, a systemd timer,
  or your platform's equivalent, calling the commands above.
- No built-in restore verification. Test a restore against a scratch
  database/volume before you need it for real.
- No cross-region replication or off-site copy step — that's your
  infrastructure decision, not something this repo prescribes.
