# Guidon: research, release priorities and product direction

Research date: 2026-10-24. Repository baseline: merged PR #55.
Board: Guidon project `6661ef0a-81d9-490e-bdf7-f954ed4accd4`.

## Evidence and current release decision

The live board snapshot contained 207 tasks: 50 Done, 103 Review, 29 Todo and
25 Backlog. Review is implemented work awaiting acceptance, not evidence that
103 features are production-ready. Do not mass-close these cards.

**Release decision: HOLD pending evidence.** Existing component/fixture tests
and 596 isolated PostgreSQL checks are valuable, but do not prove production
configuration, Cloud authentication, payment processing or backup restoration.
The prior launch checklist describes features implemented in code; this report
adds execution priorities and explicit verification gaps.

A runtime dependency audit on this date (`npm audit --omit=dev`) reported
11 affected package nodes: 3 critical, 5 high and 3 moderate. This is an
advisory/version finding, not proof of an exploit against Guidon. Dependency
remediation is an additional release blocker; retain the lockfile and rerun
the full regression suite after upgrades. Do not use forced blanket fixes or
call the product release-ready while this finding is unresolved.

Immediate work is existing task `ab507a10-28c0-4c81-a35c-5c2d6bdd0cab`:
real-application E2E infrastructure, isolated accounts/database, three browsers,
failure artifacts and CI. Start with login/session and private-project negative
checks; expand the same harness for the existing auth/onboarding/board/module
QA cards. Do not create a competing test stack for each feature.

The first clean E2E run passed Chromium/Firefox/WebKit against a freshly
built application and disposable PostgreSQL, including cleanup. It also
exposed a WebKit login hydration race: controlled email input could be reset
before listeners attached. Login inputs/submit now wait for hydration; an
SSR-with-scripts-blocked regression check accompanies real login tests.
The auth command also now enables TypeScript stripping consistently on
Node 22.14. These results do not remove the Cloud/staging gaps below.

## Research: what changes the plan

| Source evidence | Inference for Guidon | Concrete work |
| --- | --- | --- |
| [Linear MCP documentation](https://linear.app/docs/mcp) describes authenticated agent access and read-only scope options. | MCP connectivity alone is already a baseline feature; it is an insufficient product distinction. | Make the task → decision/context → agent → reviewed result workflow reliable and easy to activate. Reuse the Context Engine cards, existing provenance and game-engine/IDE plugins. |
| [OWASP API1:2023](https://api-security.owasp.org/editions/2023/en/0xa1-broken-object-level-authorization/) requires authorization for the particular object on each operation and negative tests. | Another user's project title is also a data leak; UUIDs and hiding UI controls are insufficient. | Retest “Niebezpieczne” (`121c8707-0178-444e-85ef-9a9becdeb68d`) across project lists, dashboard, direct routes, API/MCP, files and export, including role revocation. |
| [Playwright CI guidance](https://playwright.dev/docs/ci) recommends reproducible browser dependencies, bounded runs and retained reports. [Next.js's Playwright guide](https://nextjs.org/docs/app/guides/testing/playwright) covers testing the built application. | A fixture rendering one component is not an authenticated application E2E test. | Fresh production build, real isolated PostgreSQL, real form/session flow, Chromium/Firefox/WebKit, traces/screenshots/video and deterministic cleanup. |
| [Stripe webhook documentation](https://docs.stripe.com/webhooks) documents duplicate deliveries and lack of guaranteed ordering. | Checkout success alone cannot establish correct paid entitlements. | Existing Stripe sandbox QA card must verify duplicate/out-of-order events, signature failures, payment failure, downgrade/cancellation and retained entitlement consistency. No real charges for tests. |

The product direction below is a hypothesis to validate with customers, not a
claim about existing demand, revenue, retention or future valuation.

## Product hypothesis and measurable value

Start with a specific proposed customer: small development/game teams already
using coding agents and an IDE or game-engine workflow. Validate this with
design partners before expanding the target market. The current repo already
supports this direction through project context, MCP and engine plugins.

Proposed primary outcome: a teammate or agent can resume a real task with the
relevant decisions and sources, then return a result a person can review.
Provenance, access control and freshness matter more here than accumulating
additional module types. Context suggestions must be distinguishable from
verified facts and must disappear when source access is revoked.

Use the existing funnel analytics task (`de9151ad-aa1c-40ba-9467-018e5f7b2a48`)
to define and measure, with the deployed consent/privacy controls:

- Activation: organization/project + first useful task + first accepted human
  or agent result. Track integration connection as a separate step.
- Time to value: time from signup to first task and first reviewed result;
  establish a measured baseline before promising a target.
- Retention: weekly returning organizations performing meaningful work and
  week-1/week-4 cohorts, split by team size and integration usage.
- Paid value: conversion, cancellation reasons and continued active team use;
  evaluate alongside provider/storage/support costs per active organization.
- Trust: failed critical flows, unauthorized-access regressions, migration
  failures, recovery evidence and webhook delivery failures.

Do not substitute page views, signups or fabricated install counts for these
outcomes. No customer events or real telemetry are asserted by this report.

## Execution order using the existing board

1. **Establish release evidence.** E2E infrastructure `ab507a10…`; triage Review
   `1ca736ec…`, prioritizing “Niebezpieczne”, auth/session and other critical
   cards. Preserve Done/Review semantics and document unresolved cases.
2. **Close critical workflows.** Auth `faf1537d…`, onboarding `0a88a2dd…`, board
   concurrency `d7b880f7…`, tenant/API/MCP isolation `f76a9572…`, Stripe sandbox
   `9129015e…`. Reuse the harness and real application paths.
3. **Prove operations.** Monitoring/backup `2cc56dff…`, release gate `5b734e2a…`:
   actual staging restore, migration status/checksums, previous-version app
   compatibility, rollback plan and owner deployment approval. A written backup
   recipe is not a successful restore test.
4. **Remove daily friction.** Mobile `c011cbbb…`, accessibility `868d6605…`,
   performance `40e24352…`; fix the new sidebar/board layout tickets against
   evidence. Measure large-project baselines before setting budgets.
5. **Complete the module journey.** Fixture preview `02c6dccb…`, visual editor
   `7354e24f…`, module QA `ec708b24…`/`b8127b26…`, immutable moderated publishing
   `423650d6…`, author dashboard `24207c27…`. Keep public publication blocked
   until moderation/permissions are implemented.
6. **Build a distinct context workflow.** Existing Context Engine capture,
   linking, verified memory, Why Panel and scoped retrieval cards. Reuse the
   existing GitHub integration; measure source accuracy and permission behavior.
7. **Expand deliberately.** Durable webhook delivery `c83d728d…`, scoped
   automation, developer sandbox after security review, and paid-module design.
   Shared AI spending budgets are required before treating per-process limits
   as a global cost guarantee across Vercel instances/replicas.

This orders the backlog; it does not silently remove features from scope or
declare every task required for an initial release. Each PR must state its
actual acceptance evidence and remaining dependencies.

## External approval and evidence still required

- Cloud Supabase/PostgREST/Auth staging must be verified separately from the
  self-hosted PostgreSQL E2E path. One passing path does not certify the other.
- OAuth provider round trips, Sentry staging delivery, Stripe sandbox and
  backup restore need their actual isolated integrations/configuration.
- Real-device mobile and screen-reader checks remain manual evidence steps.
- No production deploy, registry package publication, paid advertisement,
  real payment or author payout follows automatically from this research.
- Release requires a fresh go/no-go record, resolved critical failures and the
  owner's explicit approval for production deployment.
