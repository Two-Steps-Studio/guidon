# Forgot password (hosted mode, Resend-sent, branded)

## Problem

Guidon has no password-recovery feature at all — confirmed via grep, no
code path calls `resetPasswordForEmail`, `signInWithOtp`,
`inviteUserByEmail`, `updateUser({ email })`, or reauthentication.
Someone who forgets their password on the hosted product has no way
back into their account. Self-hosted mode has no email-sending
capability whatsoever (confirmed: `local-auth.ts` only uses email for
format validation, nothing sends mail) — so this feature is
hosted-mode only, gated the same way `OAuthButtons` already hides
itself in self-hosted (`{!local && ...}`).

Rather than relying on Supabase's own email dispatch (which requires
configuring SMTP in the Supabase dashboard and editing the email
template there, disconnected from this repo), Guidon's own backend
generates the recovery link via Supabase's admin API and sends the
actual email itself through Resend — full control over the template
lives in code, reviewable and versioned like everything else, and
isn't gated on Supabase dashboard configuration at all beyond having a
service-role key (which this codebase already uses elsewhere).

## Design

### Flow

1. `/auth/login` gets a "Forgot password?" link next to the password
   field, hidden in self-hosted mode (`local`).
2. `/auth/forgot-password` — email-only form. Submitting calls a new
   Server Action, `requestPasswordReset(email)`.
3. `requestPasswordReset(email)`:
   - Rate-limits by email first, before doing anything else that could
     reveal whether the address exists (see "Anti-enumeration" below).
   - Uses `createServiceClient()` (already used elsewhere in this
     codebase for service-role operations) to call
     `supabase.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo } })`,
     where `redirectTo` is
     `${SITE_URL}/auth/callback?redirect=${encodeURIComponent("/auth/reset-password")}`
     (`SITE_URL` from `src/lib/site-url.ts`, already the single source
     of truth for the app's own origin). This returns an
     `action_link` **without** Supabase sending its own email.
   - Sends the actual email itself via a new `sendPasswordResetEmail`
     helper (Resend's REST API, plain `fetch`, no SDK dependency —
     same philosophy as this codebase's AI providers: "avoids adding a
     vendor SDK dependency where a small fetch call suffices").
   - Always returns the same generic result to the caller, regardless
     of whether the email existed, was rate-limited, or the email send
     itself failed for an unrelated reason (see "Anti-enumeration").
4. The user clicks the link in the email. It's a Supabase-hosted
   verify URL; Supabase verifies the recovery token and redirects to
   the `redirectTo` above — i.e. back into **this app's existing**
   `/auth/callback` route, completely unchanged, exactly the same way
   the OAuth flow already works (`exchangeCodeForSession`, then
   redirect to whatever `?redirect=` says — here, `/auth/reset-password`).
   No changes to `callback/route.ts` or `safe-redirect.ts` are needed.
5. `/auth/reset-password` — by the time this page renders, the
   callback has already established a real Supabase session (the
   recovery token, exchanged). The page checks for that session
   server-side; no session means the link was invalid/expired/already
   used, and it redirects to `/auth/login`. With a session, it shows a
   new-password form that calls `supabase.auth.updateUser({ password })`
   (client-side, same pattern login/signup already use), then redirects
   to `/auth/login?message=...`.

### Self-hosted gating

`/auth/forgot-password/page.tsx` and `/auth/reset-password/page.tsx`
both redirect to `/auth/login` immediately when `hasDirectDatabase()`
is true — this feature simply does not exist in that mode, the same
as OAuth doesn't. The login page's "Forgot password?" link is hidden
under the same `{!local && ...}` condition `OAuthButtons` already uses.

### Anti-enumeration

`requestPasswordReset` must never let a caller distinguish "that email
exists" from "that email doesn't exist" through its response, timing,
or rate-limit behavior:

- The Server Action's return value is the same generic
  `{ error: null }`-shaped success in all three cases: real email
  (link generated and sent), nonexistent email (`generateLink` errors
  with something like "user not found" — caught and swallowed, logged
  server-side only), **and an unrelated send failure** (Resend API
  error — logged server-side, but *also* swallowed into the same
  generic success, not surfaced distinctly). An earlier version of
  this spec called the send-failure case "safe to show distinctly
  because it happens identically regardless of whether the email
  exists" — that reasoning was wrong: the send-failure branch is only
  reachable *after* `generateLink` has already confirmed the email
  exists, so surfacing it differently from the nonexistent-email case
  would make any systemic Resend problem (a bad `RESEND_API_KEY`, an
  unverified `RESEND_FROM_EMAIL` sending domain, a Resend outage) a
  perfect enumeration oracle for as long as it lasted — every real
  account would hit the distinguishing branch, every fake one the
  generic success. Caught during code-quality review before this
  shipped; the corrected behavior is what's described above.
- The UI's success state ("If that email has an account, we've sent a
  password reset link") is worded to never confirm or deny existence
  either.
- Rate-limiting (below) increments its counter *before* calling
  `generateLink`, so a nonexistent email hit 5 times looks identical
  from the outside to a real email hit 5 times.

### Rate limiting

Reuses `src/lib/auth/rate-limit.ts`'s existing `isLockedOut`/
`recordFailedAttempt` functions (already in this codebase for login
lockout) rather than writing a near-duplicate module — same
in-memory-per-process tradeoff, already documented and accepted there.
Key it as `` `reset:${normalizedEmail}` `` so this doesn't share a
counter with that module's own login-lockout tracking for the same
email address (a different concern with the same shape). This
reasonable to reuse as-is: 5 requests per 15 minutes per email is a
sane default for both "wrong password attempts" and "reset email
requests," and this repo's existing rate-limit module isn't
parameterized per call site — reusing it exactly as it stands is
simpler than forking a second copy with different constants for no
concrete reason.

### Resend integration

New file, `src/lib/email/resend.ts`:

```typescript
export async function sendPasswordResetEmail(to: string, resetLink: string): Promise<void>
```

- Reads `RESEND_API_KEY` and `RESEND_FROM_EMAIL` from `process.env`,
  throwing a clear "X requires Y to be set" error if either is missing
  — same fail-loudly-at-use-time philosophy as `requireEnv` in
  `src/lib/ai/provider.ts` (not reused directly, since that helper's
  signature is tied to `AIProviderName` — a small local equivalent
  instead).
- POSTs to `https://api.resend.com/emails` with
  `Authorization: Bearer ${RESEND_API_KEY}`, `from: RESEND_FROM_EMAIL`,
  `to: [to]`, `subject: "Reset your Guidon password"`, and `html`
  built from a template function in the same file.
- Throws on a non-2xx response (caller distinguishes this from a
  "user not found" `generateLink` error to decide which message to
  show, per "Anti-enumeration" above).

The HTML template reuses the exact visual language already delivered
for the "Confirm sign up" template in the previous round (dark
card, Guidon wordmark, `#1d4fd8` primary-blue button) — same look,
different copy ("Reset your password" / "Set a new password for your
Guidon account" instead of confirming an email), and a real
interpolated link instead of a `{{ .ConfirmationURL }}` Go-template
placeholder, since this is sent by our own code now rather than
through Supabase's dashboard template engine.

### Env vars

Two new required (for this feature only) env vars, documented in
`.env.example`: `RESEND_API_KEY` and `RESEND_FROM_EMAIL` (e.g.
`"Guidon <noreply@useguidon.com>"`). Missing either only breaks
`requestPasswordReset` itself (throws when actually called) — it does
not affect any other part of the app, the same way an unset
`AI_PROVIDER` only affects AI features and nothing else.

### Verification

- `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- No schema/RLS change, so `npm run test:db` is optional but cheap to
  run for confidence.
- Manual/browser check is necessarily limited: sending a real email
  requires a working `RESEND_API_KEY` (a real Resend account with a
  verified domain) and a real Supabase project with a service-role
  key, neither of which are assumed to exist in this session's dev
  environment. The plan's implementer verifies as much of the flow as
  possible without live credentials (code review, tsc/lint/build,
  tracing the logic by hand) and clearly states what could only be
  exercised end-to-end by the user themselves once `RESEND_API_KEY`/
  `RESEND_FROM_EMAIL` are actually configured in their environment.

## Out of scope

- Redoing the already-shipped "Confirm sign up" email the same way
  (fully code-driven via Resend, replacing the Supabase-dashboard
  template delivered in the previous round). A natural, symmetrical
  follow-up, but not requested for this round — mention it as an
  option, don't build it silently.
- Any self-hosted equivalent (no email-sending capability exists
  there at all; out of scope for this feature entirely, not just this
  round).
- Magic link/OTP, invite-user, change-email, or reauthentication flows
  — confirmed unused by any current code path; building their email
  templates now would be dead code no feature triggers.
- Persisting or displaying rate-limit state anywhere in the UI beyond
  a plain error message when it trips.
- A "resend the email" button/cooldown UI on the forgot-password page
  itself — submitting the form again re-triggers the same rate-limited
  action, which is sufficient.
