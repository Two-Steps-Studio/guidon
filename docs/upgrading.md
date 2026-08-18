# Upgrading a self-hosted instance

This covers upgrading code and schema on an instance you run yourself. If
you're on Guidon Cloud, there's nothing for you to do — upgrades are handled
for you.

## What tooling actually exists

- `scripts/migrate.mjs` (`npm run migrate`, `npm run migrate:status`) — applies
  pending schema migrations, records each one's checksum in
  `guidon_migrations`, and hard-errors if a previously-applied migration file
  was edited afterward (the checksum won't match). It is safe to run
  repeatedly: with nothing pending, it's a no-op.
- `GET /api/health` — reports whether database/storage/auth/ai are reachable
  after you restart.

That's the complete list. **There is no automatic rollback tooling in this
repo.** `scripts/migrate.mjs`'s own doc comment is explicit about this:
"nothing is ever deleted or rolled back automatically." If a migration needs
to be undone, that's a manual operation against your database — plan
accordingly before applying one to a production instance, e.g. with a backup
(see [backups.md](./backups.md)).

## Docker Compose

```bash
git pull                      # or pull whatever registry/tag you deploy from
docker compose build          # rebuilds db/migrate/app images from the new code
docker compose up -d
```

The `migrate` service runs automatically as part of `docker compose up` and
must complete successfully before `app` starts (`depends_on:
migrate.condition: service_completed_successfully` in `docker-compose.yml`)
— you don't need to run migrations as a separate step in this path.

To check what a pending upgrade will do before committing to it:

```bash
docker compose run --rm migrate node scripts/migrate.mjs --status
```

## Non-Docker (bare-metal)

```bash
git pull
npm ci
npm run migrate:status   # see what's pending, changes nothing
npm run migrate          # apply it
npm run build
npm run start             # restart your process manager / service here
```

## After upgrading

Check `GET /api/health`. A `200` with `status: "ok"` (or `not_configured`
components for anything you haven't set up, like AI) means the instance came
back healthy. A `503` with `status: "down"` means at least one required
component failed — the response names which one (`database`, `storage`,
`auth`, or `ai`) and a short, secret-free reason.

## Notes

- Migrations apply in filename order, each in its own transaction — a
  failure partway through only rolls back the one migration that failed, not
  everything already applied in that run.
- If you're running `DATABASE_URL` against a plain PostgreSQL (not
  Supabase), the runner re-applies `src/db/bootstrap/000_auth_compat.sql`
  only when `auth.uid()` is missing — on a database that already has it,
  the file isn't even read, so upgrading doesn't re-run it unnecessarily.
- See `src/db/migrations/README.md` for what any individual migration does.
