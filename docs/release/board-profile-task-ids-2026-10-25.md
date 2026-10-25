# Board overflow, profile dates and task IDs — 2026-10-25

Guidon cards:

- `2fe34c9f-5e8b-4fa8-920b-c64ae37b1cff`: Tabela zadań.
- `9bea1b31-cdae-4bf2-a7d7-9f7c2e20a506`: profile ENVIRONMENT_FALLBACK.
- `6d2c3a23-6b52-4e69-8cf2-28e548e9c37e`: copying task IDs.

## Board scroll root cause

The previous layout regression compared visible board/column rectangles only.
It could pass even though the board had a much larger scrollable overflow area.
New run `56c55e9a00f4`, on the existing source with the stronger regression,
failed in Chromium: scrollHeight 4134 px inside a clientHeight of 782 px.

Task cards contain absolutely positioned screen-reader labels. Their nearest
positioned ancestor was the board, outside the vertically clipped column.
Labels in off-screen cards could escape that clip and contribute to the board's
scrollable overflow. Positioning each card relatively keeps its labels inside
the column's clip chain. Labels remain available to assistive technology;
there is no fixed task count, guessed pixel cap or hidden overflow workaround.

The strengthened real-browser regression checks both visible bounds and
scrollHeight, adds 40 cards to one column, checks that the column retains its
own scrollbar and that its end is next to the last card, then checks mobile
bounds. Existing horizontal scroll and gesture regressions remain enabled.

## Profile date reference

Connected apps called `format.relativeTime` without a reference time. The
profile page now obtains request-scoped `getNow()` alongside its other data
and passes that Date to the client component. Relative formatting explicitly
uses the same reference during server rendering, hydration and rerenders.
This is a request snapshot, refreshed on navigation/reload, not a live timer.
The connection's calendar date explicitly uses UTC so it cannot vary with
the server/browser default timezone.

The connected-app regression seeds only disposable OAuth rows, checks a used
and unused connection, verifies a foreign user's grant is absent, reloads and
checks formatting/hydration errors. The runner also rejects server-side
ENVIRONMENT_FALLBACK messages instead of suppressing them. No OAuth endpoint,
issuer check, grant permission or revocation behavior changes.

Reference: [next-intl date and relative time formatting](https://next-intl.dev/docs/usage/dates-times).

## Full task identifier

The task dialog already copied the shortened `guidon#xxxxxxxx` reference for
Git mentions. It now also shows the complete UUID, with a separately labelled
copy button. Successful copy shows a toast; browser refusal shows an error
and leaves selectable text available for manual copying. Read-only dialogs
use the same header. The old Git reference and action remain intact.

Labels are supplied in English, Polish, German and Spanish. The Chromium
regression writes/reads the actual clipboard, distinguishes UUID from Git
reference, and injects a browser permission rejection to verify error feedback.
All three engines check that the full identifier is displayed.

## Verification

- Local full clean-build release run `5b548262f0ec`: passed Chromium,
  Firefox and WebKit, including board overflow, clipboard and connected-app
  regressions, plus 110 REST/MCP checks. All 27 axe scans had zero violations;
  four incomplete findings per browser still require manual assessment.
- Local clean-build mobile run `846107969ed3`: passed all three engines at
  375/390/430 px and 812x375 landscape, plus Chromium native touch gestures.
  These remain browser emulation results, not physical phone certification.
- Both local server logs contained zero ENVIRONMENT_FALLBACK messages. The
  explicit UTC option and runner-level log assertion were added after those
  local source snapshots; final-head verification is required in PR CI.
- TypeScript, focused ESLint, four-locale message parsing and diff checks
  passed. No new dependency or migration is introduced.

No production deployment, live database migration or changes to real OAuth
clients were performed.
