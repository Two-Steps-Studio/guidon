# GitHub integration audit - 2026-10-29

Guidon task: `f135cc67-9109-4401-af53-cdefdbd8131e`. This is a partial implementation audit, not acceptance of the whole Development Hub.

| Requirement | Repository evidence | Finding |
| --- | --- | --- |
| Task links to commits, branches and PRs | `src/lib/github/link-core.ts`, `src/lib/github/webhook.ts`, `src/components/work/task-links-panel.tsx` | Implemented; explicit references and suggestions are distinct; a person can confirm/reject suggestions. |
| PR lifecycle | `nextPrState`, `planPullRequest` | Open/draft/closed/merged state; late events do not undo a merge. |
| Signed webhook and permissions | `src/app/api/github/webhook/route.ts`, `findConnections`, `applyActions` | HMAC before processing; repository installation match; writes as connecting user under RLS. Live installation permissions were not inspected. |
| Repeat deliveries | `recordEvent`, unique task links | Task event claims and link uniqueness prevent duplicate comments/links. This does not prove exactly-once processing across every partial failure. |
| Results of CI and deployments | Webhook event allowlist | Not implemented: only `push` and `pull_request` are processed; check/deployment events are ignored. |
| Diff and review | `task-links-panel.tsx` | External PR link exists; no dedicated diff/review panel or review-event ingestion. |

The separate card `914a6ba9-3689-4b8b-96a7-789db32d9722` (Github) concerns public repository/self-hosting links, not Development Hub functionality. Its Review status must not be treated as proof that CI/deployment ingestion exists.

## Narrow repair in this PR

The old verifier decoded the supplied hex before checking its complete syntax. Node's hex decoder silently truncates malformed suffixes: a valid digest followed by garbage, whitespace or a single hex digit was accepted. This still required a valid HMAC; it was not an unsigned-request authentication bypass.

The shared verifier now requires the exact header length and 64 hex digits before decoding, and retains `timingSafeEqual`. It is isolated in `signature.ts` so the real implementation can be tested without loading the database. The webhook keeps importing the same exported verifier through `webhook.ts`.

`npm run test:github`: 72 pass, 0 fail. Four malformed-suffix cases failed before the fix and pass after it. Includes the [official GitHub verification vector](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries), wrong secret, altered body, missing/short headers, existing linking/state rules. Focused ESLint passed. The new CI run must verify the updated PR head; earlier green CI applies to the earlier commit only.

## Project-bound MCP keys

Card `5808b2b2-e1f5-486d-8b65-9c652638b936` remains unimplemented. `/api/mcp` explicitly rejects bound keys; `guardApiRequest` defaults to denying them unless the route supplies the matching project. Task-ID routes and project listing currently use that fail-closed default. The Connect dialog accurately documents the limitation.

Do not remove the MCP rejection alone. A complete change must first resolve task ownership under RLS, enforce the key's project on every task operation, filter project listing, then add the Connect choice and tests where the same user can access both projects A and B. Cross-user RLS tests alone cannot prove a key is bound to A. Keep existing denial until the complete flow and security review pass. No authorization guard was weakened in this pass.
