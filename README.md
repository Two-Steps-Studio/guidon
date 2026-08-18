# Guidon

Context-first project management for development teams. Understand why your project exists.

## Overview

Guidon is an independent SaaS application built with modern web technologies, designed to help development teams manage projects with a focus on context, decisions, and memory. It provides a centralized platform for tracking project decisions, relationships between entities, and project knowledge.

## Tech Stack

- **Framework**: Next.js 16.3.0 with App Router (Server Components + Server Actions — pages under `/projects` and `/organizations` read and write data server-side, not from the browser)
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS v4
- **UI Components**: shadcn/ui (Radix UI primitives)
- **Database**: PostgreSQL — Supabase (default) or a self-hosted instance via the compatibility layer in `src/db/bootstrap/000_auth_compat.sql`, applied automatically when needed
- **Authentication**: Supabase Auth (email/password, Google, Discord)
- **Storage**: pluggable via `StorageProvider` — Supabase Storage (default) or local filesystem
- **Icons**: Lucide React

## Project Structure

```
guidon/
├── src/
│   ├── app/                 # Next.js App Router pages
│   │   ├── auth/            # Login, signup, logout — the only client-side data pages
│   │   ├── dashboard/        # Server Component
│   │   ├── organizations/    # Server Components + actions.ts (Server Actions)
│   │   ├── projects/[id]/    # Server Components + actions.ts, files/actions.ts (uploads)
│   │   └── api/
│   │       ├── health/       # GET /api/health — reports db/storage/auth/ai status
│   │       ├── storage/      # Serves files under the local StorageProvider
│   │       └── v1/           # Legacy REST API, no longer used by the UI
│   ├── components/
│   │   ├── layout/          # Layout components (navigation, dashboard shell)
│   │   └── ui/               # shadcn/ui components
│   ├── lib/
│   │   ├── auth/             # Authentication helpers
│   │   ├── db/                # pool.ts (pg Pool) + session.ts (RLS-scoped transactions)
│   │   ├── storage/           # StorageProvider abstraction (Supabase / local / S3)
│   │   ├── api/                # API response utilities
│   │   ├── supabase.ts        # Client-side Supabase client
│   │   ├── supabase-server.ts # Server-side Supabase client
│   │   └── utils.ts           # Utility functions
│   ├── types/
│   │   ├── context.ts      # Context Layer type definitions
│   │   ├── project.ts      # Project-related types
│   │   ├── task.ts         # Task-related types
│   │   └── api.ts          # API response types
│   └── db/
│       ├── bootstrap/
│       │   └── 000_auth_compat.sql   # Recreates auth.uid()/auth.users/roles on plain Postgres
│       └── migrations/
│           ├── 000_baseline_schema.sql  # ... through 009_creator_visibility.sql
│           └── README.md                # Per-migration reference
├── scripts/
│   └── migrate.mjs         # Migration runner — npm run migrate / migrate:status
├── tests/
│   └── db/compat.test.mjs  # npm run test:db — real Postgres via PGlite, no Docker
├── public/                 # Static assets
├── Dockerfile               # Multi-stage production image
├── docker-compose.yml       # db + migrate + app services for self-hosting
├── components.json         # shadcn/ui configuration
├── next.config.ts          # Next.js configuration (output: "standalone")
├── tsconfig.json           # TypeScript configuration
└── package.json            # Dependencies
```

## Getting Started

### Prerequisites

- Node.js 18+ (Docker image uses Node 22)
- npm
- Either a Supabase project, or a plain PostgreSQL instance (self-hosted)

### Environment Variables

Copy `.env.example` to `.env.local` and fill in the `REQUIRED` section. The
file documents every variable inline, including the self-hosted-only ones
(`DATABASE_URL`, `STORAGE_PROVIDER`, `STORAGE_PATH`) and the not-yet-implemented
ones (`AI_PROVIDER` and friends — see `docs/self-hosting-audit.md`).

```bash
cp .env.example .env.local
```

At minimum, for a Supabase-backed install:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
AUTH_SECRET=$(openssl rand -hex 32)
```

### Installation

1. Install dependencies:
```bash
npm install
```

2. Run the development server:
```bash
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000) in your browser

### Database Setup

Migrations are applied by a runner, not pasted into the SQL editor by hand:

```bash
npm run migrate:status   # what is applied, what is pending — changes nothing
npm run migrate          # apply everything pending
```

This requires `DATABASE_URL` (for Supabase: Project Settings → Database →
Connection string, not the REST URL). If the target database has no
`auth.uid()` — i.e. it's a plain PostgreSQL, not Supabase — the runner first
applies `src/db/bootstrap/000_auth_compat.sql`, which recreates the `auth`
schema, `auth.users`, `auth.uid()`, and the `anon`/`authenticated`/`service_role`
roles the schema's 70 RLS policies depend on. On Supabase this step is skipped
entirely. See `src/db/migrations/README.md` for what each numbered migration
does.

Verify the whole migration chain (compat layer + all migrations) against a
real PostgreSQL, with no Docker and no Supabase account:

```bash
npm run test:db
```

### Storage Buckets

With `STORAGE_PROVIDER=supabase` (the default), the application creates the
following storage buckets on first use:
- `guidon-files`: Project files
- `guidon-attachments`: Task attachments
- `guidon-exports`: Exported data

With `STORAGE_PROVIDER=local`, files are written under `STORAGE_PATH` and
served through `/api/storage` instead. File uploads go through a Server
Action (`src/app/projects/[id]/files/actions.ts`), so both providers work
without the browser needing direct access to storage.

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

### Type Checking

The project uses strict TypeScript. Run type checking:
```bash
npx tsc --noEmit
```

### Building

Build the project for production:
```bash
npm run build
```

## Architecture

### Context Layer

Guidon's core feature is the Context Layer, which provides:
- **Decisions**: Track architectural, technical, and product decisions
- **Relations**: Define relationships between projects, tasks, decisions, and other entities
- **Sources**: Link to documentation, comments, commits, and other context sources
- **Memory**: Store project knowledge, rules, constraints, and AI insights

### Permission System

Role-based access control with:
- **Organization roles**: owner, admin, member
- **Project roles**: owner, admin, developer, tester, viewer
- **Granular permissions**: view, edit, manage tasks, manage members, etc.

### Authentication

Supabase Auth integration with:
- Email/password authentication
- Session management
- Profile synchronization

### Storage

File management with:
- Project files (documents, graphics, source code)
- Task attachments
- Storage quotas (5GB per project, 50GB per organization)
- File validation and size limits

## Key Features

- **Project Management**: Create and manage projects within organizations
- **Task Tracking**: Tasks with status, priority, and decision links
- **Roadmap Phases**: Organize work into phases
- **Context Layer**: Track decisions, relations, and project memory
- **Team Collaboration**: Invite members and assign roles
- **File Management**: Upload and organize project files
- **Activity Logging**: Track all project activities

## Database Schema

The database includes tables for:
- Profiles (user profiles)
- Organizations & Organization Members
- Projects & Project Members
- Tasks & Task Comments
- Roadmap Phases
- Project Files
- Technologies
- Invitations
- Activity Logs
- Context Decisions, Relations, Sources
- Project Memory

See `src/db/migrations/README.md` for the full migration chain
(`000_baseline_schema.sql` through `009_creator_visibility.sql`) and what each
one does.

## Security

- Row-Level Security (RLS) on all tables
- Role-based access control
- Permission checks for all operations
- Input validation
- Secure file uploads

## Deployment

### Vercel

1. Push code to GitHub
2. Import project in Vercel
3. Add environment variables
4. Deploy

### Self-hosted (Docker)

A production `Dockerfile` (multi-stage, `output: "standalone"`) and a
`docker-compose.yml` (Postgres + a one-shot `migrate` service + the app) are
included:

```bash
cp .env.example .env
# fill in .env — POSTGRES_PASSWORD and AUTH_SECRET are required
docker compose up -d
```

The `migrate` service applies the compatibility layer and all migrations
against the bundled Postgres before the app container starts, so the schema
is never behind the code. See `docs/self-hosting-audit.md` for the current
state of the self-hosting effort — Server Components/Actions, the compat
layer, and Docker are done; an `AIProvider` abstraction is not.

### Other Platforms

Build the project and deploy the `.next` folder to any Node.js hosting platform.

## License

Proprietary - All rights reserved

## Support

For issues and questions, contact the development team.
