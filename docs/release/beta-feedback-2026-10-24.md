# Beta label and rated feedback — 2026-10-24

Guidon cards: `6fdc95eb-3afd-4703-80d1-8f63c0b22632` (BETA),
`56b3bd1f-0b60-4e07-8f26-9561388e5eae` (feedback rating).

## User-facing behavior

- A shared BETA badge uses existing semantic brand colors in the app header,
  public hero/footer, login/signup and onboarding. It does not cover controls
  with a floating overlay or add a dismissible warning.
- Feedback asks for an explicit 1–5 rating using native labeled radio controls,
  keyboard navigation and 44px touch targets. Sending requires text and a score.
  Failed submissions retain both values; reopening the form starts fresh.
- The admin inbox shows each score or an explicit “No rating” for old feedback.
  Ordinary organization/project members do not gain instance-admin access.
- Labels and errors are provided in English, Polish, German and Spanish.
  Database errors are not returned verbatim to the sender.

## Database rollout and rollback

Migration `084_feedback_rating.sql` adds nullable `smallint` with a 1–5 CHECK.
No rows are rewritten/deleted, no RLS/grants change and no index is needed.
Old clients can omit the score; supplying an invalid score is rejected server-side.
Old records remain NULL, without fabricated historical ratings.

Apply 084 in the designated environment **before** deploying the new writer and
admin reader. Verify migration history/checksums with the existing runner.
An application rollback can retain the additive column/constraint: old writers
still work, and submitted ratings are preserved for the next version. Do not
drop the column as an automatic rollback. No production migration/deploy is
authorized by this document or performed as part of this PR.

## Evidence

- Full isolated PostgreSQL regression suite: 606 pass / 0 fail, including old
  writer compatibility, 1/5 bounds, invalid scores and unchanged author isolation.
- A separate migration upgrade fixture starts with an existing unrated row,
  preserves its text/identity, applies 084 twice and retains a new rated row.
  Input validation and all four locale catalogs are checked.
- The actual production-app E2E includes mobile rating/keyboard, forged invalid
  score, database failure with retry/input preservation, persisted score/context,
  admin display of rated/legacy entries and non-admin denial in three browsers.
- Cloud/PostgREST deployment configuration remains a separate staging gate.

Verified local run: `bf226207c4b0` — clean install, real migrations, production
build, packaging canaries, REST/MCP checks, expanded auth/feedback scenarios in
Chromium/Firefox/WebKit, credential log scan and cleanup pass. Targeted ESLint
and whitespace checks pass. A 375px feedback screenshot was visually inspected.
