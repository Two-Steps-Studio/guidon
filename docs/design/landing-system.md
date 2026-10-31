# Guidon landing system

## Audit and scope (2026-10-31, before implementation)

The existing homepage mixes the brand's Geist with Fraunces display headings,
several container widths, translucent scrims, bright animated dithering, large
3D screenshot transforms and a 170svh pinned laptop. The full-screen hero has
no navigation and explains too many integration details before showing the
product. The 390px production view fills the first screen with copy and actions.
Six similar feature rows and several overlapping explanations dilute the
context-first message. Footer links have no clear grouping. Recent pricing
improvements are functional but use the same inconsistent display font and a
floating control that competes with content.

Reviewed the public pages and browser views of [Linear](https://linear.app/),
[Vercel](https://vercel.com/home) and [Raycast](https://www.raycast.com/).
Linear supplies the primary lesson: a restrained hierarchy with a large, legible
product surface. Vercel supplies disciplined typography, alignment and section
boundaries. Raycast supplies deliberate product framing and attention to small
details. Their copy, compositions, assets, customer claims and branding are not
reused. Guidon's own brand kit and shipped features remain the source of truth.

Changes are limited to the homepage and its presentation components. Existing
pricing queries, calculations, checkout destinations, canonical/Markdown metadata
and JSON-LD stay intact. Authenticated interfaces, APIs and schemas are outside
scope. The shared background renderer receives only a homepage-specific opt-out.

## System

| Primitive | Contract |
| --- | --- |
| Typeface | Existing Geist Sans. Geist Mono only for short section labels. No new font download. |
| Display | Fluid 40–80px, 600 weight, 1.05 line height, -0.045em tracking. |
| Headings | Section 32–48px; card 20–24px, 600 weight, -0.025em tracking. |
| Body | 16px/1.65; lead 18–20px/1.6; labels 12px/1.5. |
| Spacing | 4, 8, 12, 16, 24, 32, 48, 64, 96, 128px. Section padding 64px mobile, 96px desktop. |
| Containers | Main 1120px, product 1200px, prose 640px; horizontal gutters 20–32px. |
| Colors | Existing semantic neutrals, Guidon Blue #1D4FD8, Electric Blue #4D8DFF. Existing theme tokens determine contrast. |
| Surfaces | Opaque background and secondary background, 1px semantic borders. No glass, animated texture or ambient glow. |
| Radius | Controls 8px, cards 12px, product frames 16px. |
| Actions | 44px minimum height, one primary blue action, neutral secondary action, visible keyboard focus. |
| Cards | Common border/padding; imagery carries the story. One restrained product-frame shadow. |
| Layout | Navigation → concise hero → actual product → three benefits → feature showcase → optional AI/integrations → existing pricing → FAQ → final CTA → grouped footer. |
| Motion | One-time 12px/opacity entrances at 400ms, maximum 60ms stagger. No pinned scroll, perspective, cursor tilt, autoplay or replay buttons. Keyboard settles motion; reduced motion uses a short opacity change. Content remains available without JS. |

## Validation contract

Production-build browser captures at desktop (1440px), tablet (834px), mobile
(390px and 320px), in light and dark themes. Inspect section rhythm, typography,
image legibility, contrast, navigation, button/heading alignment and horizontal
overflow. Exercise real product view selection, native FAQ, keyboard focus and
reduced motion. Retain pricing-period/currency/CTA behavior checks using the
existing disposable catalogue fixture. Run accessibility checks, lint, TypeScript
and the isolated build. Record actual evidence and limitations after validation.

## Implementation and validation

The homepage now follows this single system, including pricing and the grouped
footer. The old marketing-only camera/tilt/story components were removed. The
existing logged-in UI, APIs, schema, pricing calculations and checkout targets
were not redesigned. The shared background renderer opts out only at `/`.
Period/currency selection is immediate to avoid low-contrast color crossfades.
Secondary footer/sandbox links do not speculatively prefetch whole documents.
Theme-specific product images follow Next 16's `fetchPriority` guidance rather
than using the deprecated `priority` prop to preload both versions.

Ten WebP assets were recaptured from the real application with the existing
fictional Emberfall demo and its solid-background preference. No customer data,
usage claims or testimonials were introduced. The task-detail excerpt focuses
on its title/description, not administrative controls. Total source bytes fell
from 702,698 to 599,460 (14.7%); this is an asset-size comparison, not a Lighthouse
or real-device performance score.

Asset reproduction: `node tests/e2e/run.mjs --landing-assets` creates its own
PostgreSQL container, uses the existing demo seed, removes only that run's API
test workspace/noisy activity and invokes the capture script. Its loopback-only
test-certificate flag does not change application TLS/security configuration.
The resulting assets are under `output/e2e/<run>/landing-assets` for review before
promotion to `public/landing`. Final asset capture: `6acc692de699`.

### Verified

- `node tests/e2e/run.mjs --landing`: **passed**, run `fc7203a3755f`, using a clean
  production build and disposable PostgreSQL. Chromium, Firefox and WebKit passed.
- Twenty-four viewport/theme combinations (1440, 834, 390, 320px; light/dark;
  three engines), plus Polish/German/Spanish mobile checks at 320px. Full-page
  screenshots and viewport screenshots were inspected; final geometry includes
  aligned pricing feature lists and single-line mobile navigation actions.
- Ten Chromium WCAG A/AA scans: eight homepage combinations and two pricing
  views, **zero violations**. Keyboard skip link, native FAQ, real product view
  selection, reduced motion, one main/H1, canonical/Markdown metadata and JSON-LD
  correspondence passed. Images and primary navigation also render without JS.
- Existing pricing behavior passed with a five-plan synthetic catalogue:
  weekly/monthly/yearly selection, currency handling, unavailable prices,
  free/custom plans, signup and authenticated upgrade query propagation.
- `npm run lint`: zero errors, one pre-existing unused `context` warning in
  `tests/e2e/ui-polish.mjs`. Targeted lint, TypeScript and `git diff --check` passed.
- `npm run test:billing`: 3 public-price cases, 43 billing checks and 14 webhook
  cases passed. No billing implementation changed.

Earlier validation iterations caught a canonical-URL formatting assumption,
an unreliable Firefox `image.decode()` promise with page JS disabled, WebKit's
OS-language default in a new test context, a transient pricing contrast issue,
and unnecessary prefetch activity. The final tests retain their semantic,
contrast, real image-loading and no-JavaScript assertions with explicit fixture
locale and browser-network settling. No errors are ignored to obtain the pass.

### Review artifacts and limits

Use `output/e2e/fc7203a3755f/`: `chromium-landing-dark-1440.png`,
`chromium-landing-light-1440-full.png`, corresponding tablet/mobile and other
engine captures, `landing-pl-320.png`, the no-JS images and `landing-a11y-*.json`.
The source screenshot captures are actual UI with explicitly illustrative data.

This validation uses browser viewports, not physical mobile hardware. Live Cloud
pricing/Stripe settings and numeric Lighthouse budgets were not remeasured.
No production deployment, environment update or database migration was performed.
