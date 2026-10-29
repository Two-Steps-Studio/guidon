# Large-project performance baseline - 2026-10-27

Guidon task `40e24352` ([QA][P1] Performance i regresja dużych projektów).

## Setup

- **Command:** `npm run perf:large` (`tests/perf/large-project.mjs`).
- **App:** a production build (standalone server) running on PostgreSQL 17,
  self-hosted mode, where every query goes through RLS.
- **Data:** the script seeds a fictitious user, an organization and three
  projects, with 100, 1000 and 3000 tasks. Statuses and priorities are
  mixed, about 30% of tasks are done, and 1% of titles contain the word
  "needle" for search. The script removes all of it afterwards.
- **Repeats:** 5 runs per metric, one warm-up for the board. Times are
  reported as p50 and p95 in ms.
- **Not measured:** Supabase Cloud (no staging, per the 2026-10-25
  constraint), which adds network latency between Vercel and the database.

## What is measured

| Metric | How |
|---|---|
| `boardLoadMs` | Browser: navigation to the board until the cards are in the DOM and the page is `complete` |
| `boardServerMs` | Server render of the board page (HTTP GET), sequentially |
| `apiFirstPageMs` | `GET /api/v1/projects/{id}/tasks?limit=100` |
| `apiWalkAllMs` | Every page at 100 per page, checking that each task appears exactly once |
| `searchMs` | `GET /api/v1/search?q=needle&project_id=…` |
| `parallelWritesMs` | 20 `PATCH /api/v1/tasks/{id}` sent at once; all must return 200 |

## Results

Both rows in each pair below come from the same machine and the same
script, before and after the fixes in this PR.

| Tasks | Board (browser) p95 | Board (server) p95 | API page 1 p95 | API, all pages | Search p95 | 20 parallel writes |
|---|---|---|---|---|---|---|
| 100 | 959 | 339 | 81 | 56 | 64 | 392 |
| 1000 | 2069 | 1087 | 65 | **548** (was 1484) | 281 | 254 |
| 3000 | 2307 (1000 cards) | 1379 | 59 | **1460** (was 10398) | 266 | 265 |

The parallel writes never failed or timed out.

## What the measurements found and what was fixed

1. **The API slowed down on deeper pages.** At 3000 tasks the first page
   took ~50 ms, but a deep page took ~350 ms, and reading the whole list
   took 10.4 s.
   - Cause: the `OR` condition in `list_project_tasks_page` (072). It
     stopped Postgres from using the index, so every earlier row was
     filtered through RLS.
   - EXPLAIN: 642 ms for the old function, 24 ms for the same query written
     to use the index.
   - Fix: migration 095. `test:db` section 77 checks that every page is
     identical to 072's.
   - Result: 7× faster at 3000 tasks.
2. **Above 1000 tasks the board showed a random 1000.** The query had
   `LIMIT 1000` with no `ORDER BY` and no message, so open tasks could
   disappear from the board without warning.
   - The board now shows open tasks first, most recently updated first.
   - It shows a message that the limit applies and that the remaining
     tasks are available through search or the API.
   - The perf script fails if that message is missing or appears when it
     shouldn't.
3. **Rendering 1000 cards takes ~2 s in the browser.** That is the cost of
   the full DOM, not the server. Virtualizing the board's columns is the
   next step if real projects reach this size. The budget catches any
   further growth.

## Interactions and a phone (2026-10-28, task `2d7ce5a4`)

The app times its key actions itself (`src/lib/perf/action-timing.ts`):
- save, create, move and delete, from the click to the server's answer;
- recorded as a Sentry span in production (with Web Vitals, once
  `NEXT_PUBLIC_SENTRY_DSN` is set) and as a `guidon:task.*` performance
  entry that the perf script reads.

Opening a task is measured from the click to the dialog's title field. The
phone profile has 4× slower CPU and "Fast 4G", on the 1000-task board.

First CI run (GitHub runner, production build, p50 / p95 in ms):

| | 100 tasks | 1000 | 3000 (board shows 1000) | Phone, 1000 |
|---|---|---|---|---|
| Open a task | 153 / 483 | 481 / 874 | 432 / 843 | 1104 / 2861 |
| Save | 71 / 99 | 186 / 338 | 158 / 253 | |
| Move | 88 / 118 | 283 / 305 | 407 / 409 | |
| Create | 83 / 90 | 126 / 204 | 120 / 185 | |
| Board load | 440 / 696 | 1110 / 1327 | 1194 / 1250 | 4150 / 4844 |

### Targets (from the task; not yet all met)

- **Opening a task on a mid-range phone, p95 ≤ 1.5 s: not met (2.9 s).**
  The slow one was the first open, which waited for the dialog's code.
  The board now fetches that code when it's idle (`usePreloadTaskDialog`).
  The next CI run shows whether that's enough.
- **Board load on that phone: 4.8 s at 1000 tasks.** That's the cost of
  rendering 1000 cards on a slow CPU. Virtualizing the columns is the
  fix if real projects get that big.
- **UI reaction without network ≤ 200 ms:** moves are optimistic, so the
  card moves at once. This isn't measured separately yet.
- **No regression above 20%:** not checked automatically. With 5 runs on
  shared runners, p95 varies more than that between identical runs. The
  2× budgets catch real regressions without failing on noise.

## Budgets and CI

`tests/perf/budgets.json` sets each p95 at 2× the value measured in CI,
rounded up. Budgets only catch regressions; the targets above are stricter.
Raise a budget only with a new measurement.

The `Large-project performance` workflow (`.github/workflows/performance.yml`)
does a production build on PostgreSQL 17, runs the script with `--budgets`
and saves the JSON as an artifact. It runs:
- on PRs that touch the board, the task dialogs, the data layer,
  migrations or the perf script;
- weekly;
- by hand, with `sizes` (for example `100,1000,10000`).

Correctness of pagination is covered on every PR by `test:db`.

## Not covered yet

- File uploads under load.
- Supabase Cloud latency.
- `/my-tasks` (limit 500) and `/mini` (limit 1000). Both have the same
  silent cap, and the same open-first ordering could be applied there.
