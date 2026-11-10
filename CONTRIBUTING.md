# Contributing to Guidon

Thanks for helping. Bug reports, ideas, docs fixes and code are all welcome.

## Before you start

- **Bug or idea?** [Open an issue](https://github.com/Two-Steps-Studio/guidon/issues/new/choose) first. For anything bigger than a small fix, wait for a reply before writing code, so your work fits where the project is going.
- **Security problem?** Don't open a public issue. See [SECURITY.md](./SECURITY.md).
- Be kind. See the [Code of Conduct](./CODE_OF_CONDUCT.md).

## Run it locally

You need Node.js 22 and either a Supabase project or a PostgreSQL database.

```bash
npm install
cp .env.example .env.local   # see docs/configuration.md for every variable
npm run migrate              # only with DATABASE_URL (plain PostgreSQL)
npm run dev                  # http://localhost:5803
```

The quickest way to get a full stack with its own database is
`./scripts/self-host.sh` (Docker). See [docs/self-hosting.md](./docs/self-hosting.md).

## Making a change

1. Fork the repository and create a branch from `main`.
2. Keep the change small and focused: one fix or feature per pull request.
3. Run the checks:

   ```bash
   npm run lint
   npx tsc --noEmit
   npm run test:db      # after any change to migrations, RLS or Server Actions
   ```

   There are more test scripts (`npm run test:*`, listed in
   [CLAUDE.md](./CLAUDE.md#commands)). Run the ones for the area you touched.
   UI changes have no automated tests: check them in the browser, in light and
   dark mode and on a narrow screen.
4. Open a pull request and fill in the template.

## Things worth knowing

- **Row-Level Security is the real permission check.** Every table is guarded by
  RLS policies in `src/db/migrations/`. App-level checks are a second layer.
- **Two data modes.** The app runs on Supabase or on plain PostgreSQL
  (`DATABASE_URL`). New code should use `dataClient(userId)` so one code path
  works in both. See [docs/architecture.md](./docs/architecture.md).
- **Migrations are append-only.** Add a new numbered file in
  `src/db/migrations/`; never edit one that has been released.
- **Every user-facing string is translated** into English, Polish, German and
  Spanish (`messages/*.json`).
- **Next.js 16 differs from older versions.** Middleware lives in
  `src/proxy.ts`. Read `node_modules/next/dist/docs/` before relying on memory.

## Licence of contributions

Guidon is licensed under AGPL-3.0-only. By submitting a pull request you agree
that your contribution is licensed under the same terms (for the SDKs and CLI,
under their MIT licence).
