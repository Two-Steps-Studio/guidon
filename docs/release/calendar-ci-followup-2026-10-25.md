# Calendar saves, dropdown surfaces and CI follow-up — 2026-10-25

Follow-up to PR #74, which was merged while this batch was being verified. Guidon
cards: `f3bdc95c-1b04-41b7-8418-04c59ab99631` (task description) and
`23054157-0802-4357-8e2b-dcf36d3b5685` (dropdown backgrounds).

## Calendar edit snapshot

The calendar selected display columns and passed those rows into the full task
dialog. Its projection omitted `revision`, `is_done` and recurrence fields.
Consequently the form captured revision -1 and refused a save even on a fully
migrated database. Merely adding the revision would leave recurrence settings
missing from the form and risk clearing them during a full save.

The calendar now fetches the same complete task snapshot as the board, through
the existing caller-scoped SQL/PostgREST paths and project/date filters. This
also avoids querying a nonexistent revision column explicitly on an older
schema. A genuinely unavailable revision still fails closed in the unchanged
save action; no version check or authorization is bypassed.

The browser regression creates a repeating task and edits its description from
the calendar. It checks persistence, revision advancement and preservation of
the recurrence/completion fields; injects a concurrent update; proves the stale
save is rejected with the draft retained; then reloads and successfully saves.

Migration 086 remains a prerequisite for versioned editing on the target
database. This source fix does not apply that migration, reconcile a manually
changed schema or prove the production database has its trigger/column. A
missing-schema case remains separate from this confirmed projection defect.

## Dropdown appearance

The shared Select trigger uses the theme's `bg-background`, matching outline
buttons instead of exposing the pattern beneath a transparent control. Hover,
focus, disabled states, custom class overrides and touch handling remain in
their existing components. The mobile matrix checks that the priority picker
has a nontransparent computed background before using it.

## Linux CI root cause

GitHub Actions run `40219372023`, head `b244ea792c837decb252a24c564ec358fb380300`:
application passed; mobile and accessibility failed before building the app.
Both attempted the nonexistent entry point
`/opt/hostedtoolcache/node/22.23.3/x64/bin/node_modules/npm/bin/npm-cli.js`.

`npm run test:e2e` inherited npm's correct `npm_execpath`, while the two direct
`node tests/e2e/run.mjs --…` jobs used a Windows-style fallback relative to the
Node executable. On setup-node Linux, npm is resolved from PATH rather than a
`bin/node_modules` directory.

The runner now retains an inherited npm entry point, retains the Windows
Node/CLI launch with separate arguments (including paths containing spaces),
and uses the npm executable on PATH for direct POSIX invocations. No shell or
additional environment inheritance is introduced. All three CI jobs run the
small launcher regression as well as their existing suites.

The launcher regression passed on Windows and inside `node:22-alpine`, with
network disabled, a read-only filesystem/source mount, dropped capabilities,
limited CPU/memory/PIDs and a small temporary filesystem. It exercises an
actual `npm --version`, plus setup-node-style Linux paths, macOS, Windows
paths with spaces and inherited npm entry points. This is a focused launcher
check, not a claim of a new full application security audit.

The initial full run `0d8e3776ce20` passed Chromium and Firefox, but WebKit
stopped in the existing assignment regression: the next dropdown was opened
while the previous menu's close/focus restoration was still pending. The test
now waits for the old menu to disappear before opening the next one, using the
normal UI without forced clicks, retries or increased timeouts.

## Verification

- Full clean production build + release E2E + accessibility, run
  `0f001582a611`: passed Chromium, Firefox and WebKit, including the new
  calendar persistence/concurrency/recurrence regression and 110 REST/MCP
  isolation checks. All 27 axe scans had zero violations; four incomplete
  findings per browser still require manual assessment.
- Mobile clean production build, run `bf88bfd18cf1`: passed all three
  browsers, each at 375/390/430 px and 812x375 landscape, including the
  dropdown background assertion, touch selection and persistence. Chromium's
  native CDP swipe/cancel/hold-drag cases passed too. Physical device checks
  remain open as documented in `mobile-qa-2026-10-25.md`.
- `npm run test:task-editing`, `npx tsc --noEmit`, focused ESLint and
  `git diff --check`: passed. The portable npm launcher passed on Windows
  and isolated Linux as described above.

These are local isolated self-hosted results; remote CI is reported separately
on the pull request. No production deployment, live database change, live
schema migration or real email was performed.
