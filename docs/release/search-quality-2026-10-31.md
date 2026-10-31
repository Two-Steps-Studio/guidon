# Search quality and anonymous diagnostics

Guidon task: `c8d8fcc0-660e-467d-9c55-6e8e2a023e8f`. Base: `24d6a6ba`.

## Root causes and behavior

- Previously, short task references were only ranked against the 2000 most recently updated candidates. Older tasks could disappear even when their reference was unambiguous. References now use bounded, parameterized UUID primary-key ranges under the caller's RLS identity. Explicit all-letter `guidon#abcdef` references are supported; ordinary hex words remain title searches.
- Exact titles could lose their candidate slot to the first 50 substring matches. A separate escaped, case-insensitive exact-title lookup now protects them. This does not create an unbounded fuzzy search: ambiguous prefixes and old typo/diacritic-only matches remain bounded.
- Candidate queries have deterministic update-time/ID ordering, and rank ties have an ID fallback. No separate search index was added. A committed title update is visible on the next request in regression tests.
- The command palette explains an empty result and offers a clear action that returns focus to the input. A bounded-candidate notice suggests using a precise title/full ID. The API returns only a boolean diagnostic, does not echo driver errors and marks successful private results `private, no-store`.

## Tracking plan

| Event | Trigger | Decision supported |
| --- | --- | --- |
| `results` | Non-aborted command-palette response with results | Search volume denominator |
| `zero` | Non-aborted successful response with no results | Empty-result share and relevance investigation |
| `click` | Selecting an actual search result | Whether results are being used |
| `failed` | Non-aborted failed search request | Distinguish availability errors from empty results |

Every payload is exactly one fixed event name. No query, title, task/project/user
ID, page URL, session identifier or custom property is stored in the counters.
The same-origin endpoint authenticates the session, checks the canonical
`APP_URL` origin, bounds actual streamed bytes, validates the enum and rate
limits requests. Authentication cookies and transient rate-limit bookkeeping
remain part of normal request handling, not analytics rows. An upstream host's
own request logs are outside these aggregate counters.

Browser transport is best effort, respects Do Not Track and Global Privacy
Control, and never blocks the product action. Repeated requests and retries may
be counted more than once; these numbers are not unique users, a conversion
funnel, or proof that a task was found correctly. REST/MCP searches are not
included in the command-palette metrics.

Migration `104_search_quality_counters.sql` adds only UTC day/event/count and
an atomic invoker RPC. Only `service_role` has table/RPC access; ordinary users
cannot directly increment or read it. Rows older than 56 days are removed on
the next accepted event. There is no scheduler or automatic email delivery.

`/admin/search`, linked from the existing admin navigation, displays eight
Monday-based UTC weeks including the incomplete current week. Review this page
weekly during beta. Missing counters are reported as unavailable, not zero;
empty denominators show no percentage. Instance-admin authorization is unchanged.

## Verification

- `npm run test:search`: 49 ranking/fixture checks, 5 candidate regressions and 3 metrics cases passed.
- `npm run test:db`: 879 checks passed, including migration 104, invoker security, authenticated-role denials, invalid event rejection, increments and stale-row pruning. The schema assertion was updated from 63 to 64 tables for the new counter table.
- TypeScript, targeted ESLint and diff checks passed.
- `node tests/e2e/run.mjs --search`: production build and Chromium/Firefox/WebKit passed; evidence `output/e2e/09ce80acf70e`.
- Disposable PostgreSQL fixtures exceed 2000 recent tasks and 50 substring matches. Checks cover old exact titles/full IDs/prefixes, foreign-project RLS, immediate rename visibility, empty-state recovery/focus, actual result navigation, concurrent metric increments, oversized/invalid/foreign-origin requests, schema privacy, admin report and real 204 beacon responses.
- WebKit does not expose Blob beacon bodies via Playwright `request.postData()`. The test observes the original Blob and original transport, and checks actual successful responses; it retains the payload assertions.

## Rollout and rollback

No production migration, environment change or deployment was performed.
Apply migration 104 through the normal reviewed migration process before
expecting counts. Older databases still support search; counters fail quietly
and the report shows unavailable. `APP_URL` must be the canonical public origin
for that environment, including the HTTPS scheme/port behind a TLS proxy.

For application rollback, restore the prior application build. The isolated
aggregate table can remain without affecting tasks. If removing the schema,
first stop callers, then remove `public.record_search_event(text)` and
`public.search_quality_counts` in a separately reviewed migration; that removes
only the aggregate history. Hosted Supabase behavior and a production metrics
baseline have not been live-tested here.
