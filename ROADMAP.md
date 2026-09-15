# Roadmap

This document outlines realistic, near-term development priorities for Guidon, based on the actual state of the codebase (commit history, migrations, explicitly reserved-but-unimplemented abstractions) rather than a rewrite of the original founding plan.

> **Note (2026-09-15):** Guidon originated as a spin-out of Two Steps Studio's `/dev` project-management module (see `GUIDON_AUDIT_REPORT.md` in the `two-steps-studio` repo, dated 2026-08-13). That report proposed a 16-week MVP plan starting from "Week 1: project setup." The codebase has since moved well past that starting point — auth, organizations, projects, a configurable kanban board, AI task chat, project memory/insights, file storage, GitHub integration, an admin panel, and a dual-mode (Supabase / self-hosted Postgres with RLS parity) data layer are all real and in use, not scaffolding. This roadmap reflects the *current* state, not the original founding plan.

## Table of Contents

- [Current Status](#current-status)
- [Now](#now)
- [Next](#next)
- [Later](#later)
- [Documentation Debt](#documentation-debt)

## Current Status

**Status**: Active development, dual-mode data layer in production use across 47 `actions.ts` files.

### What's already working

- Auth: email/password, OAuth (Google/Discord), forgot/reset password
- Organizations: list, billing UI, members, settings
- Projects: tasks/kanban (project-configurable columns, subtasks with full `TaskStatus`), activity, decisions, files (with a Monaco-based code workspace), knowledge, memory, roadmap, technology, members
- AI task chat and project-memory insight generation — wired to a real `AIProvider` abstraction (7 backends: Anthropic, Azure OpenAI, plus OpenAI-compatible for OpenAI/OpenRouter/Groq/Ollama/custom)
- Admin panel (dashboard, organizations, users, logs, integrations), gated by `ADMIN_EMAILS`
- GitHub integration (connect/callback/setup, repo picker in files)
- Dual-mode data layer: self-hosted Postgres (`withUser` + RLS via `SET LOCAL ROLE`) or hosted Supabase — same RLS policies enforced either way
- 31 numbered migrations (`000`–`030`)

## Now

The most recently completed commit work was project methodology (Standard/Scrum); the very next commits so far are only a **written plan**, not code — that's the clearest "what's next" signal in the repo.

- [ ] Implement multi-language support (EN/PL/DE/ES) — spec already exists under `docs/superpowers/specs`, no code yet
- [ ] Wire a real payment provider behind the existing billing UI and `subscriptions` table (migration `015`) — today there's a UI and a schema, but no Stripe (or equivalent) integration

## Next

- [ ] Build the S3 storage provider. `src/lib/storage/provider.ts` explicitly throws `"STORAGE_PROVIDER=s3 is not implemented yet"` — a deliberate fail-loud placeholder, not a bug, but it blocks self-hosted deployments that don't want to depend on Supabase Storage.
- [ ] Expand the public API surface. `/api/v1` currently only exposes `/search` — thin for anything meant to be consumed externally.
- [ ] Correct `README.md`'s "self-hosted Postgres not yet used by the app" and "AI abstraction not yet called by any feature" claims — both are stale; `CLAUDE.md` already documents the actual (in-use) state, but the README should match.

## Later

- [ ] Semantic search in project memory (pgvector — mentioned as a future direction, not started)
- [ ] Broaden AI feature surface beyond task chat + memory insights
- [ ] Mobile companion — low priority, needs explicit product sign-off before scoping

## Documentation Debt

- `README.md`'s "Project structure" tree is accurate; its "not yet used" claims about self-hosted Postgres and AI are not (see [Next](#next))
- No repo-level roadmap existed before this file — future updates to priorities should land here rather than only in `docs/superpowers/plans`, so there's one place to check current direction
