# Launch readiness checklist

This checklist evaluates the ten items in the launch checklist attached to
the Guidon task **Do zrobienia** against the current repository. The source
list is written for a mobile app, so some items do not map directly to
Guidon's web SaaS model. “Implemented” means code exists; production service
configuration still needs to be checked in the deployment environment.

## Release evidence update — 2026-10-24

**Release remains on HOLD until the remaining integration/operations evidence
and owner deployment approval.** The execution order and dated board baseline
are in [release research](./release/research-and-execution-2026-10-24.md).
Current implementation/evidence records:

- [Patched runtime dependencies and shipped Monaco sanitizer](./release/patched-dependencies-2026-10-24.md).
- [Standalone artifacts without runtime configuration/data](./release/standalone-package-2026-10-24.md).
- [Actual signup/session/owner-viewer coverage and Cloud gaps](./release/authentication-coverage-2026-10-24.md).
- [Actual REST/MCP isolation, scope and mutation checks](./release/api-mcp-isolation-2026-10-24.md).
- [Security and tenant isolation incl. modules, open findings](./release/security-tenant-isolation-2026-10-27.md).
- [Cloud, safe email, Stripe sandbox and recovery evidence handoff](./release/staging-handoff.md).

Tests use disposable databases/credentials and actual production builds. Local
and CI success do not certify untested Cloud configuration, external providers,
distributed limits, payment processing or backup restoration. The findings below
remain a repository feature inventory, not a declaration of production readiness.

## Findings

| # | Launch item | Status | Repository evidence and next step |
| --- | --- | --- | --- |
| 1 | Apple / Google sign-in | **Partial** | Google and Discord OAuth are supported, and self-hosted OAuth also supports GitHub and GitLab. Apple sign-in is not in the current provider list. Confirm the Cloud provider is enabled and decide whether Apple is valuable for this web product. |
| 2 | Ask for a review after a win | **Not applicable as written** | Guidon is distributed as a web product, not through an iOS/Android app store, so native store-review prompts do not apply. Collect customer feedback or testimonials through a deliberate, low-frequency product or support workflow instead. |
| 3 | Show a paywall after users get value | **Implemented** | Guidon has a Free plan, usage limits, plan comparison, upgrade flow, and Stripe billing management. Confirm the production plan limits and prices match the intended free-to-paid path. |
| 4 | Restore purchases | **Not applicable as written** | There are no app-store purchases to restore. Cloud billing is managed through Stripe and the organization billing page. |
| 5 | Empty states for every screen | **Mostly implemented; needs a sweep** | Dashboard, projects, organizations, tasks, files, decisions, context, roadmap, memory, and other lists use explanatory empty states. Walk every enabled module and role before launch to catch screens that still show a blank panel or generic message. |
| 6 | Crash reporting from day one | **Implemented; deployment setting required** | Server and client Sentry initialization are conditional on `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN`. Confirm both are set for the Cloud production build and that the correct project receives an event. |
| 7 | Basic analytics | **Implemented; review deployment/privacy settings** | The hosted app loads Google Analytics. Self-hosted instances do not. Confirm the Cloud property, event coverage, and applicable consent/privacy behavior before launch. |
| 8 | Feedback / feature requests | **Implemented** | Signed-in users can send feedback from the app shell; administrators have a feedback inbox. Make sure someone owns triage and responses. |
| 9 | Re-engagement notices | **Partial** | Guidon has in-app notifications for product activity. The repository does not show an email digest or inactivity-based re-engagement flow. Decide whether email is needed; avoid adding unsolicited reminders without a clear user preference. |
| 10 | Screenshots that tell a story | **Implemented; review freshness** | `public/landing/` contains seven feature screenshots in light and dark variants: dashboard, task board, decisions, knowledge base, roadmap, memory/context, and AI task API. Review them against the current product before using them in a campaign. |

## Recommended launch checks

1. Verify Cloud OAuth, Sentry, Stripe prices, and Google Analytics against the
   production environment; repository code cannot confirm deployment values.
2. Walk the app as an owner, developer, tester, and viewer. Check every module
   and its empty state, permissions, and mobile layout.
3. Confirm the feedback inbox has an owner and a response process.
4. Refresh marketing screenshots after the remaining UI fixes are reviewed.
5. Decide whether the product needs Apple sign-in or email re-engagement; the
   current web SaaS flow works without either feature.

## Repository references

- Authentication providers: `src/lib/auth/oauth-providers.ts`
- Plans and limits: `src/lib/limits.ts`, `src/app/upgrade/`, and
  `src/app/organizations/[id]/billing/`
- Error reporting: `src/instrumentation.ts` and `src/instrumentation-client.ts`
- Feedback: `src/components/layout/feedback-dialog.tsx` and
  `src/app/admin/feedback/`
- In-app notifications: `src/components/layout/notifications-bell.tsx` and
  `src/lib/data/notifications.ts`
- Marketing screenshots: `public/landing/`
