# Launch readiness: end-to-end path and go/no-go - 2026-10-27

Guidon task `57226c85` ([Launch] Audyt gotowości do premiery i scenariusze
end-to-end). This page shows where each step of the customer path is
already tested, what stops a launch, and the criteria for one. It links the
existing tickets instead of repeating them.

## The path, step by step

**E2E** below means `npm run test:e2e`, which runs on every PR. It uses a
production build, a fresh PostgreSQL and real logins in Chromium, Firefox
and WebKit. **Mobile** is `run.mjs --mobile-audit` at 375 px with touch
input. **a11y** is `run.mjs --accessibility-audit`.

| # | Step | Evidence | Desktop | Mobile | Roles / tenants | Status |
|---|---|---|---|---|---|---|
| 1 | Sign-up, login, password reset, sessions | `authentication.mjs`; `test:auth` | E2E | Mobile | invalid/revoked sessions | ✅ (ticket `faf1537d`) |
| 2 | Onboarding → organization → first project | `onboarding.mjs` (project type, modules, studio) | E2E | Mobile | new account | ✅ (ticket `0a88a2dd`) |
| 3 | Invitation | `onboarding.mjs`: a link for an address without an account, only the hash is stored, acceptance; `test:db` section 75 | E2E | - | member role | ✅ |
| 4 | Tasks | `task-editing.mjs`, `board-layout.mjs`, `calendar-editing.mjs`; `test:task-editing` | E2E | Mobile | viewer has no write controls | ✅ |
| 5 | AI and MCP | `ai-chat.mjs` (boundary without a provider); `api-isolation.mjs` (125 REST/MCP checks); `agent-claims.mjs`; `profile-connected-apps.mjs` (OAuth apps) | E2E | - | owner / viewer / read-only key / other tenant / removed member | ✅ |
| 6 | Paid subscription | `test:billing` (webhook flow, 14 cases, PR #84). **No end-to-end run against Stripe test mode** | - | - | owner/admin only (`canManageOrg`) | ⛔ see blockers |
| 7 | Cancellation | Stripe Customer Portal → `customer.subscription.updated/deleted` → Free (unit-tested in `test:billing`) | - | - | - | ⛔ same as 6 |
| - | Tenant isolation, RLS | `test:db` (741 on #82, 709 on #84); `docs/release/security-tenant-isolation-2026-10-27.md` | | | two organizations, viewer, stranger | ✅ (ticket `97feeeb4`) |
| - | Large projects | `npm run perf:large`; `docs/release/performance-baseline-2026-10-27.md` | | | | ✅ (ticket `40e24352`) |
| - | Backup / rollback | `test:restore` in CI; `docs/release-runbook.md` | | | | ✅ procedure; Cloud setup pending (ticket `2cc56dff`) |
| - | Accessibility | `run.mjs --accessibility-audit` | E2E | | | ✅ |

## Blockers

### P0: no launch with paid plans until resolved

1. **There is no payment account the product can legally use.** Stripe and
   Paddle accounts have to be opened by an adult, either a parent or
   guardian or their company. Until then, steps 6-7 can't be run even in
   test mode. Tickets: `bb72c893` (production Stripe) and `73e5b3b9` (paid
   modules, design only).
2. **PRs #82 and #84 must be merged and their migrations applied in
   production:**
   - 086-092, if not applied yet;
   - 093 and 094 (#82);
   - 095 and 096 (#84).

   The runbook gives the order: migrations first, then the app.

### P1: fix before or right after launch

- Set up monitoring (runbook section 3):
  - `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` in Vercel;
  - an uptime check on `/api/health`;
  - Sentry alerts;
  - confirm Supabase backups / PITR.
- Set `RESEND_API_KEY` and `RESEND_FROM_EMAIL` in Vercel; the domain is
  verified, the variables are not confirmed. Without them, invitations and
  password-reset emails don't go out.
- The API rate limit counts separately in each Vercel instance (security
  report, finding 1).
- The operator reviews the new privacy-policy sentence about the funnel
  statistics (PR #84).

### Fixed in this pass, so no longer blockers

- The Stripe webhook lost events, allowed out-of-order downgrades, and
  `incomplete` granted a paid plan (PR #84).
- With Stripe not configured, a paid plan on the landing page ended at a
  checkout error. Now:
  - paid plans start free, with a "paid plans open soon" note;
  - the billing page explains it.

  This still has to be checked on the Vercel preview, because the hosted
  landing page can't run locally.
- Above 1,000 tasks the board showed an arbitrary subset (PR #84).
- Restoring a backup onto a new server silently dropped the RLS grants
  (docs, PR #84).

## Go / no-go

**Free (beta) launch: GO** once all of these hold:

- [ ] #82 and #84 merged with green CI.
- [ ] Migrations 086-096 applied in production, in order. Supabase migration
      history is checked and matches the files.
- [ ] Sentry DSNs set and one test event received. Uptime check active.
- [ ] Resend variables set, and one invitation email received.
- [ ] Stripe keys **not** set in production. The landing page shows "paid
      plans open soon", and checkout is unreachable.
- [ ] Runbook section 3 smoke test done by hand: log in → board → task →
      billing page → MCP call.

**Paid launch: NO-GO** until all of these hold:

- [ ] A payment account owned by an adult (Stripe or Paddle as merchant of
      record).
- [ ] One full run in that provider's test mode:
      1. checkout with a trial, then the webhook gives the plan;
      2. a failed payment starts the grace period;
      3. cancel in the portal, after which the organization is on Free;
      4. the refund path from `/legal/refunds` works.
- [ ] Legal pages name the actual operator. The privacy policy names the
      payment provider.

## Not covered by automated tests

- Real email delivery.
- Supabase Cloud Auth, Storage and policies (no staging project, per the
  2026-10-25 constraint).
- The hosted (Supabase) landing page and billing page.
- Payments end to end.

These are listed above as manual checks for the operator.
