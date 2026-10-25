# Accessibility release gate — 2026-10-25

This gate uses `@axe-core/playwright` 4.14.0 against the actual production build
in disposable PostgreSQL. No project/customer data or external checkout is used.

## Automated scope

Run `node tests/e2e/run.mjs --accessibility-audit` for the dedicated gate or
`node tests/e2e/run.mjs --with-accessibility` for the complete application
regression followed by the same gate. CI runs the dedicated gate in a separate
job. All runs build clean source and use the existing environment/network guards.

Nine scans per browser cover login, dashboard and board in light/dark system
preferences, the open task dialog, project settings, profile and the self-hosted
billing information page. WCAG 2 A/AA, 2.1 A/AA and 2.2 AA tags are enabled.
There are no disabled rules, excluded page elements or accepted serious findings.
Critical/serious findings fail the job. Finite entrance animations settle before
contrast is measured. Incomplete and lower-severity results remain in the JSON
report and require review; a zero serious count does not mean WCAG certification.

The task dialog also exercises 25 Tab presses without focus escaping, Escape
close, and return to the invoking New task control. Existing application tests
exercise keyboard reorder, cancellation, menu access and small viewports.

## Findings addressed

- The task dialog had no Radix trigger reference, so close discarded focus.
  Its caller now records the invoking control and explicitly restores focus.
- Whole task cards were buttons containing a move-menu button. The article is
  now a container with a native task-title button; moving by keyboard retains
  focus on that button, and dragging from the title remains available.
- Custom select/menu trigger names omitted their visible selected values.
  Names now include label and selection. Search includes its visible shortcut.
- The signup link lacked a persistent non-color distinction; it is underlined.
- Project-image and wallpaper file inputs lacked connected accessible labels.
- Workflow reorder controls were 14px targets; they now have 32px desktop and
  44px small-screen bounds. The unassigned icon has an appropriate image role.

## Required manual checks (not performed by this gate)

| Environment | Action | Expected result | Result |
|---|---|---|---|
| NVDA + supported browser | Login, select theme/project, open/move/close a task | Names, value, column/position and focus are understandable; no duplicate or lost announcements | Pending human test |
| VoiceOver + Safari | Repeat task and modal flows | Rotor/Tab navigation, focus trap and live updates usable | Pending human test |
| Physical iPhone/Android | Open keyboard in task dialog, scroll, choose date, close/reopen | CTA remains reachable, safe area respected, touch controls usable | Pending human test |
| Separate Cloud/Stripe sandbox | Open hosted checkout and exercise subscription/cancel/error | Keyboard/labels/contrast work across the hosted payment boundary | Blocked until staging is configured |
| System contrast/transparency settings | Light/dark, high contrast and reduced transparency | Focus and text remain visible; semantic states remain distinguishable | Pending human test |

The self-hosted billing page is explicitly **not** a Stripe checkout test.
An automated result cannot close the Cloud or manual portions of the Guidon QA
card. No production deployment has been made.

Final local evidence: combined run `8baed7a74447` passed in Chromium, Firefox
and WebKit. All 27 scans report zero violations. Four incomplete checks per
browser remain: color contrast on login, board-light and task dialog, plus
aria-hidden-focus in the modal. The keyboard focus-trap and return tests pass;
the incomplete items still require manual assessment. JSON, traces and videos
are under `output/e2e/8baed7a74447/` and are not committed.

References: [Playwright accessibility testing](https://playwright.dev/docs/accessibility-testing),
[WCAG label in name](https://www.w3.org/WAI/WCAG22/Understanding/label-in-name.html).
