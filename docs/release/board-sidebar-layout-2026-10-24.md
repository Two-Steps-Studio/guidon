# Board/sidebar layout fixes - 2026-10-24

Guidon cards:

- `a9f55d4d-0b00-4a4f-b197-52d3d2f7c5e9`: extra scroll area below columns.
- `a583998f-0821-4a53-81bf-65ad83ea5e19`: remove pinned tasks from sidebar.
- `1dd092c3-17b8-4554-aaab-e807465b1fca`: stable icon positions on collapse.

## Board root cause and change

The desktop board's `flex: 1` grew its horizontal scroll container to all
remaining viewport space even when every column was short. A new actual-app
regression failed before the fix: **607px** below the longest column, versus
19px permitted padding/scrollbar allowance (isolated run `462de81e43a7`).

The existing fill-height mode now uses `flex: 0 1 auto`: it stays at intrinsic
column height and can shrink when long columns need the viewport cap. Existing
column scroll limits, phone behavior and drag/drop handlers remain. No resize
observer, measured-size state or unrelated board refactor is added.

## Sidebar

Pinned task links and their sidebar-only consumer are removed. Saved pins and
the provider/actions used by other task views are retained; no user data is
deleted. Pinned projects remain available.

Collapse now changes menu width while preserving row height, retains section
label space and uses equal-height logo slots. Project, theme and language
switchers retain their height and remain usable as icon-only menus. The collapsed
rail can scroll vertically so preserving spacing does not make lower controls
unreachable. This intentionally keeps vertical positions consistent in both
states. It is separate from the broader information-architecture cleanup card.

## Regression scope

The disposable production E2E checks actual small-board bounds, horizontal
scrolling, 40 additional task cards with inner-column vertical scrolling,
375px width/no page overflow, global/project/profile row center positions over
collapse/expansion, absence of pinned task links even with saved fixture pins,
and preservation/restoration of those fixture pins. New test cards are removed
only by their exact generated IDs in the disposable project.

The existing auth, feedback/admin, REST/MCP and artifact guards also run. No
production deployment or database change is performed by this work.

## Result

Clean production build and complete isolated suite passed in Chromium, Firefox
and WebKit: run `2a166aab9e54`. This includes short/long/mobile board geometry,
collapse/expansion positions, working collapsed project/theme/language menus,
saved pin preservation, and previous auth/feedback/API checks. Desktop collapsed
and 375px board screenshots were inspected. Targeted ESLint and diff checks pass.
The disposable PostgreSQL container and temporary source copy were cleaned up.

The first added long-board fixture used JavaScript-style `+` concatenation in
SQL; corrected to PostgreSQL `||` before the passing run. No application data
was involved. Cloud Supabase and Stripe remain separate staging gates; the
owner's requested setup steps are in `staging-handoff.md`.
