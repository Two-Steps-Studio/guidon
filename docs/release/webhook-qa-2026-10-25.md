# Organization webhook QA — 2026-10-25

Guidon task: `d94e8175-e41a-4522-a4ff-6bd0cada8ad4`.
Baseline: `730f02a` (main). Scope: current single-attempt organization webhooks,
their shared HTTP transport and receiver-verification examples.

## Findings and regression proof

New tests were executed against the baseline before changing production code:
6 passed and 4 failed. The failures were:

1. A local receiver continuously sent bytes beyond the requested timeout. The
   socket inactivity timer kept resetting, so the request incorrectly succeeded.
2. A receiver closed a `200` response before its declared content length was
   received. The response `close`/`error` handlers incorrectly resolved success.
3. The transport itself allowed a private literal when invoked in Cloud mode:
   literal addresses do not invoke Node's DNS callback. Existing delivery and
   OAuth callers already validate the URL before transport, so this is a
   defence-in-depth correction, not proof of a bypass in those callers.
4. The documented Node verifier accepted a correctly signed nonnumeric timestamp
   (`NaN`), because its freshness comparison did not reject non-finite values.
   This is a receiver example bug, not a demonstrated forged HMAC.

The transport now has a total request deadline, rejects interrupted responses,
retains explicit bounded-body truncation, and applies URL rules before opening
a socket. Socket-time DNS checks and redirect refusal remain enabled.
The receiver examples validate timestamp syntax and the Node example's malformed
header behavior is exercised directly from the published Markdown.

## Verification

`npm run test:webhooks`: **77 existing checks and 12 delivery/integration tests
passed** after the changes. The cases cover:

| Area | Evidence |
| --- | --- |
| URL/address policy | Invalid URL/protocol, credentials, length, loopback/private/metadata IPv4 and IPv6; self-hosted internal addresses remain allowed |
| DNS | Deterministic failing, empty, mixed public/private and public-only validation results; mixed socket answers refused; stalled socket DNS hits deadline |
| Signatures | Exact raw POST bytes, signed timestamp, delivery/event headers, secret mismatch and body tampering |
| Receiver freshness | Valid, stale, future, malformed and missing timestamps; malformed signature header; within-window deduplication documented separately |
| Transport | Local 200/204/400/429/500/503; no automatic retries; redirect not followed; bounded response body; silence, slow streaming and interrupted responses |
| Error reporting | Timeout/connection/blocked outcomes do not disclose internal exception text |
| Native formats | Discord/Slack payloads and signatures over their actual formatted bodies, using a stub transport |

Local HTTP servers bind to loopback. DNS fixtures are stubbed; no public DNS or
external receiver is needed. The dispatcher test executes the production source
through TypeScript transpilation with explicit framework/database/environment
stubs, rather than duplicating the delivery logic. These tests now run in the
release workflow, including when only webhook tests or the executable
documentation example changes.

## Limits and follow-up

- This is not a production send, load test, browser/settings QA or verification
  of a deployed Discord/Slack integration.
- The preliminary validation DNS lookup still occurs separately before the
  bounded HTTP request. Its runtime is not included in the HTTP deadline.
- No durable queue, automatic retry, stable event replay, ordering or delivery
  history was added. `429`/`5xx` remain single-attempt failures. Queue tests are
  deferred until Reliability task `c83d728d-3baa-4ae0-a87b-3ccd06552e49` implements
  the queue; they must cover backoff, deduplication, lease recovery and tenant
  isolation then.
- Only the latest delivery result is stored. Reconcile important state with
  the API; sending a Test ping does not replay a missed event.
- The transport is also used for OAuth client metadata retrieval. Bounded reads
  are preserved and the existing OAuth/auth regression suite is the adjacent
  verification gate (passed locally). Issuer checks, token handling and client registration
  policy are unchanged.

No database migration, secret/configuration change or production deployment.
