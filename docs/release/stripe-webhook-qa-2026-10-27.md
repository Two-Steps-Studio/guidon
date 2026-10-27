# Stripe webhook QA — 2026-10-27

Guidon task `9129015e` ([QA][P0] Stripe sandbox). The tests made no payments
and no network calls. The Stripe webhook's rules now live in
`src/lib/billing/stripe-webhook-core.ts`; the route
(`src/app/api/stripe/webhook/route.ts`) only verifies the signature and
connects Supabase and the Stripe API. `tests/billing-webhook.test.mjs` runs
those rules against an in-memory store and a fake Stripe (14 cases), and
`test:billing` now runs in CI.

## Bugs fixed

| Before | Effect | Now |
|---|---|---|
| The event id was recorded before handling; a failed handling (500) left it recorded | Stripe's retry was dropped as a duplicate, so the change was lost for good | The claim is released on failure, so the retry is processed. Writes set the current state, so processing again is safe |
| The handler wrote what the event said | Out-of-order delivery could roll back an upgrade, and a late `deleted` of an old subscription moved a paying organization to Free | Each event re-reads the subscription from Stripe (Stripe's recommendation). An event about a subscription that has since been replaced is ignored |
| `incomplete` and `paused` were mapped to `past_due` | A checkout that was never paid got the paid plan for the 7-day grace period | Only `trialing`, `active`, `past_due` and `unpaid` carry the plan. Every other status gets Free's limits |

## Cases covered

- Checkout with a trial:
  - the plan follows the price;
  - `trial_used_at` is set once and never moved;
  - the monthly or yearly interval is recorded;
  - the project limit follows the plan.
- Redelivery of the same event has one effect.
- Out-of-order delivery ends in Stripe's current state.
- Upgrade, yearly switch and downgrade follow the price. A price that maps to
  no plan gives Free.
- Cancel at period end keeps the plan; deletion gives Free and `canceled`.
- A failed renewal starts grace, which a later failure doesn't restart. After
  7 days the organization is `suspended` (Free's limits). Paying clears it.
- Failure while saving, or Stripe unreachable: the answer is 500, the event is
  released, and the retry has exactly one effect. A failed release is logged.
- Ignored without a write:
  - event types this endpoint doesn't handle (not even claimed);
  - subscriptions without `organization_id`;
  - organizations without a row.
- Databases from before migration 071 get no billing columns written.
- Signatures, checked offline with the real SDK: a valid signature passes; a
  changed body, the wrong secret and a timestamp older than the tolerance are
  refused.

## Not covered (needs a Stripe sandbox account)

- Checkout and Customer Portal sessions against Stripe's test mode.
- `stripe trigger` deliveries to a running instance.
- Tax and invoices.

These need the operator's Stripe test keys in an environment, never in chat.
If billing moves to Paddle (merchant of record), the same three rules apply to
its webhook: release on failure, read the current state, no plan without
payment. `processStripeEvent` and these tests are the template for it.

## Known limit

Two subscriptions live at the same time for one organization: the handler
follows whichever one changed last. Checkout should not create a second one
while one is active. That is not tested here.
