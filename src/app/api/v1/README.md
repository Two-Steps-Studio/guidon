# `/api/v1`

This directory is **not** the app's data layer. Every page under
`/projects/[id]` and `/organizations` reads through Server Components and
writes through Server Actions (see `docs/self-hosting-audit.md`, blocker 1) —
that is the only path the browser has to the database, and RLS is the
authorization boundary for it either way.

`/api/v1` is kept as a **narrow, versioned surface** for callers that are not
the Guidon browser client: GitHub webhooks and future agent integrations
(TODO.md §16). Nothing here should duplicate what a Server Action already
does for the UI.

## History

Until this cleanup the directory held 14 route handlers (`context/*`,
`files/*`, `members`, `memory`, `organizations`, `projects`, `roadmap`,
`tasks`, `technologies`) mirroring CRUD the UI used to do client-side against
PostgREST. Once every page moved to Server Components/Actions, the UI called
exactly one of them — `search`, from `src/components/layout/navigation.tsx`.
The other 13 were dead code and were deleted rather than revived; see the
plan's Etap 1 item 4 and `git log` around that change for the removed files.

## Adding a new route here

- Only add a route if the caller is genuinely external (webhook, bot, agent) —
  not the Guidon frontend. Frontend reads/writes belong in
  `src/app/**/actions.ts` (Server Actions) or the page's own data fetch.
- Auth: use `requireAuth()` / `isAuthError()` from `@/lib/auth/auth-helpers`
  for "is there a logged-in user". That module was trimmed to exactly this —
  do not resurrect the old `requireOrganizationAccess` /
  `requireProjectAccess` / `requireProjectPermission` helpers it used to
  export; they duplicated `src/lib/data/project-access.ts` and
  `src/lib/data/org-access.ts`, which are the real authorization layer for
  pages and should be reused/extended instead.
- Authorization beyond "logged in" (e.g. "can this token act on this
  project") should be checked against RLS-backed queries the same way the
  rest of the app does — do not build a second permission system.
- Webhooks specifically will need signature verification (e.g. GitHub's
  `X-Hub-Signature-256`) instead of `requireAuth()`, since the caller is not
  a logged-in browser session. Not implemented yet — no webhook route exists
  in this repo today.
