# Landing interaction and billing periods

## Behavior

- The laptop enters with a larger scroll-linked camera move, then responds to a mouse on desktop. Its visitor-controlled buttons switch between real dashboard, board and roadmap screenshots. There is no autoplay or replay control.
- Product screenshots enter from alternating sides; marketing cards have a more visible one-time entrance. Scrolling remains native.
- Reduced motion removes spatial effects. Phones avoid the sticky laptop and cursor tilt. Keyboard navigation settles decorative movement.
- Landing pricing offers week/month/year. A floating comparison control appears after the hero while pricing is outside the viewport, preserving the chosen period when it takes the visitor to pricing. Focus moves to the pricing section before that floating control disappears.
- Public prices use active `plan_prices` amounts, which the existing Stripe catalogue stores in EUR. Missing weekly/yearly prices are explicitly unavailable; amounts and discounts are never extrapolated. Free and custom-priced plans retain their meanings. Monthly catalogue fallback remains compatible with older installations.
- Signup and `/upgrade` preserve the chosen plan and validated billing interval through the organization selection. Existing billing still owns purchase confirmation and server-side price checks.

## Verification

- `npm run test:billing`: 3 public-pricing cases, 43 billing/price-sync checks and 14 Stripe webhook cases passed. The billing command now explicitly enables TypeScript stripping on Node 22 for its existing TypeScript imports.
- `npx tsc --noEmit`, targeted ESLint and `git diff --check` passed.
- `node tests/e2e/run.mjs --landing`: production build, Chromium, Firefox and WebKit passed; evidence in `output/e2e/80192496019c`.
- Browser checks cover reversible scroll transforms, cursor tilt and reset, screenshot switching, keyboard/reduced-motion behavior, 375 px layouts, billing-period selection, unavailable prices, EUR amounts under the PLN preference, custom/free plans, and the authenticated upgrade redirect.
- Cloud pricing is exercised with a synthetic catalogue rendered by a route generated only inside the runner's disposable source copy. Self-hosted production deliberately hides Cloud pricing. No test route is added to the shipped application.
- An initial run (`c94287610147`) failed because its synthetic tour was too short to leave a viewport between hero and pricing. The fixture was corrected; assertions were retained. The complete second run passed.
- A dedicated GitHub Actions workflow runs these checks and retains browser artifacts. Final localized explanatory copy was shortened after the browser run; it does not change behavior.

## Operational limits

No database migration, Stripe catalogue mutation, payment, or production deployment was performed. Weekly/yearly purchasing requires an active synchronized price for that plan in the existing catalogue. Real production Stripe configuration and phone GPU performance are not established by these disposable tests. The Markdown pricing endpoint still describes its existing monthly catalogue.
