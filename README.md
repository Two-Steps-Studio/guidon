# Guidon

Context-first project management for development teams. Guidon tracks not
just what a project's tasks are, but *why* — decisions, context relations,
project memory, and the provenance behind them — for developer- and
game-development-friendly teams.

Guidon runs three ways: as a hosted Cloud product, self-hosted on your own
infrastructure, or as a local development server. Self-hosting is a
first-class product mode here, not an afterthought — see
[docs/self-hosting.md](./docs/self-hosting.md) for the full story, including
what's genuinely self-hostable today and what isn't yet.

## Which path do I want?

| | Cloud | Self-hosted | Development |
|---|---|---|---|
| For | Using Guidon without running anything | Deploying on infrastructure you control | Changing Guidon's code |
| Runs on | Guidon Cloud | Your server (Docker Compose or bare Node) | Your machine |
| Setup | Sign up | `docker compose up -d` | `npm install && npm run dev` |
| Details | — | [docs/self-hosting.md](./docs/self-hosting.md) | below |

**Read before choosing self-hosted:** a Supabase project is currently
required for sign-in and data access on *every* path, including self-hosted
Docker Compose — the self-hosted PostgreSQL backend is built, migrated, and
independently tested, but the running application doesn't read/write
through it yet. This is explained in full, with exactly what is and isn't
wired up, in [docs/self-hosting.md](./docs/self-hosting.md#read-this-first-current-state).
Storage (`STORAGE_PROVIDER=local`) and AI (`AI_PROVIDER=ollama`) genuinely
are self-hostable today.

## Quickstart — Cloud

Nothing to run. Use the hosted product.

## Quickstart — Self-hosted

```bash
git clone <this repo>
cd guidon
cp .env.example .env
# fill in .env — see docs/self-hosting.md for what's required
docker compose up -d
curl http://localhost:3000/api/health
```

Full walkthrough, including the non-Docker path, choosing a storage/AI
backend, and admin access: [docs/self-hosting.md](./docs/self-hosting.md).

## Quickstart — Development

```bash
npm install
cp .env.example .env.local
# fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, AUTH_SECRET
npm run migrate:status   # optional: see what schema state your Supabase project is in
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Available scripts (`package.json`):

| Script | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Start the production server (after `build`) |
| `npm run lint` | ESLint |
| `npm run migrate` | Apply pending database migrations |
| `npm run migrate:status` | Show applied/pending migrations, changes nothing |
| `npm run test:db` | Verify the migration chain + RLS-compatibility layer against a real PostgreSQL (PGlite, no Docker/Supabase needed) |
| `npm run test:ai` | Test the AI provider factory's env-resolution logic, no live API key needed |

## Tech stack

- **Framework**: Next.js 16.3.0, App Router, React 19. Pages read data as
  Server Components and write through Server Actions — the browser never
  talks to the database directly (see
  [docs/architecture.md](./docs/architecture.md)).
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS v4
- **UI Components**: shadcn/ui (Radix UI primitives)
- **Database**: PostgreSQL. Supabase today for every deployment path; a
  self-hosted-Postgres compatibility layer exists and is tested but not yet
  used by the running app — see
  [docs/self-hosting.md](./docs/self-hosting.md).
- **Auth**: Supabase Auth (email/password, plus optional Google/Discord OAuth)
- **Storage**: pluggable `StorageProvider` — Supabase Storage or local
  filesystem (`s3` interface-ready, not implemented)
- **AI**: pluggable `AIProvider` abstraction, six backends — not yet called
  by any feature (see [docs/configuration.md](./docs/configuration.md#ai-todomd-67))
- **Icons**: Lucide React

## Project structure

```
guidon/
├── src/
│   ├── proxy.ts              # Route protection (Next's middleware convention, renamed upstream)
│   ├── app/                  # Next.js App Router
│   │   ├── auth/             # Login, signup, logout, OAuth callback — the only client-side data pages
│   │   ├── dashboard/
│   │   ├── organizations/    # Server Components + actions.ts (Server Actions)
│   │   ├── projects/[id]/    # Server Components + actions.ts, files/actions.ts (uploads), context/, decisions/, knowledge/, memory/, roadmap/, settings/, technology/, work/
│   │   ├── admin/            # Instance-admin panel, gated by ADMIN_EMAILS, read-only (dashboard, organizations, users, logs, integrations)
│   │   └── api/
│   │       ├── health/       # GET /api/health — reports db/storage/auth/ai status
│   │       ├── storage/      # Serves objects for STORAGE_PROVIDER=local
│   │       └── v1/           # Narrow surface for non-UI callers (currently just /search)
│   ├── components/
│   │   ├── auth/ context/ decisions/ files/ layout/ memory/ projects/ shared/ tasks/ work/
│   │   └── ui/                # shadcn/ui components
│   ├── lib/
│   │   ├── ai/                 # AIProvider abstraction + 6 backend implementations
│   │   ├── auth/                # OAuth provider config, auth helpers
│   │   ├── context/              # Context Layer: agent context, relations, task "why"
│   │   ├── data/                  # Authorization + data-access modules (current-user, org-access, project-access, admin, admin-access)
│   │   ├── db/                     # pool.ts (pg Pool) + session.ts (RLS-scoped transactions) — self-hosted-Postgres layer, not yet called by the app (see docs/architecture.md)
│   │   ├── health/                  # Shared health-check logic (db/storage/auth/ai)
│   │   ├── search/                   # Backing logic for /api/v1/search
│   │   ├── storage/                   # StorageProvider abstraction (Supabase / local / S3-reserved)
│   │   ├── work/                       # Task-board status normalization
│   │   ├── supabase.ts                # Browser Supabase client
│   │   ├── supabase-server.ts         # Server Supabase client(s)
│   │   └── utils.ts
│   ├── types/                # Shared TypeScript types
│   └── db/
│       ├── bootstrap/
│       │   └── 000_auth_compat.sql   # Recreates auth.uid()/auth.users/roles on plain PostgreSQL
│       └── migrations/
│           ├── 000_baseline_schema.sql  # ... through 012_context_relations_cleanup_triggers.sql
│           └── README.md                # Per-migration reference (authoritative — not repeated here)
├── scripts/
│   └── migrate.mjs         # Migration runner — npm run migrate / migrate:status
├── tests/
│   ├── db/compat.test.mjs   # npm run test:db
│   └── ai/provider.test.mjs # npm run test:ai
├── docs/
│   ├── self-hosting.md
│   ├── configuration.md
│   ├── upgrading.md
│   ├── backups.md
│   ├── architecture.md
│   ├── auth-setup.md            # Google/Discord OAuth setup
│   └── self-hosting-audit.md    # Working log of the self-hosting effort
├── public/                 # Static assets
├── Dockerfile               # Multi-stage production image
├── docker-compose.yml       # db + migrate + app services for self-hosting
├── .env.example             # Full environment variable reference (source of truth)
├── components.json          # shadcn/ui configuration
├── next.config.ts            # output: "standalone" for Docker only — see the file's own comment for why not unconditional
└── package.json
```

## Deeper documentation

- [docs/architecture.md](./docs/architecture.md) — how the pieces fit
  together and why (Server Components/Actions, the database layer, the
  provider abstractions, the admin panel, health checks, `/api/v1`).
- [docs/self-hosting.md](./docs/self-hosting.md) — the complete self-hosting
  walkthrough.
- [docs/configuration.md](./docs/configuration.md) — every environment
  variable, explained.
- [docs/upgrading.md](./docs/upgrading.md) — upgrading a running self-hosted
  instance.
- [docs/backups.md](./docs/backups.md) — backing up a self-hosted instance.
- [docs/auth-setup.md](./docs/auth-setup.md) — Google/Discord OAuth setup.
- `src/db/migrations/README.md` — the schema, migration by migration.

## Security

- Row-Level Security (RLS) in PostgreSQL is the actual authorization
  boundary — 70 policies, not application-level checks alone.
- Permission checks (organization/project roles) at the data-access layer,
  on top of RLS.
- `/api/health` never returns secrets, connection strings, or hostnames —
  see `src/lib/health/checks.ts`'s `safeReason()`.
- The local storage provider validates paths against directory traversal
  (`assertSafeStoragePath` / `assertSafeBucket`) and signs download URLs.

## License

**Unresolved.** This file previously stated "Proprietary - All rights
reserved." The monorepo root `LICENSE` (at `C:\tss\LICENSE`) is GPLv3. These
conflict, and that conflict has not been reconciled — the user was asked
directly and chose to leave it undecided rather than pick one now. Do not
treat either claim as authoritative until this is resolved. Nothing in this
repository (`package.json`, a `LICENSE` file, or otherwise) currently
asserts a license for Guidon specifically.

## Support

For issues and questions, contact the development team.
