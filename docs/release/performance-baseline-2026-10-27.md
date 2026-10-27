# Large-project performance baseline — 2026-10-27

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

## Budgets and CI

`tests/perf/budgets.json` sets each p95 at 2× the measured value, because CI
runners are slower than the measuring machine. Raise a budget only with a new
measurement.

The `Large-project performance` workflow runs manually from the Actions tab
(workflow_dispatch). It does a production build on PostgreSQL 17, runs the
script with `--budgets`, and saves the JSON as an artifact. It doesn't run
on every PR, because it takes several minutes and timings vary between
runners. Correctness of pagination is covered on every PR by `test:db`.

## Not covered yet

- File uploads under load.
- Supabase Cloud latency.
- `/my-tasks` (limit 500) and `/mini` (limit 1000). Both have the same
  silent cap, and the same open-first ordering could be applied there.
