# Phase 2 — Auth redirect fix and dead-code cleanup — design

## Problem

The user's original 28-point request asked to fix Guidon's auth/session
system. Investigation against the real codebase (not the request text)
found the session architecture is already correct:

- Sessions live in httpOnly cookies (Supabase GoTrue cookies for the
  hosted path, a signed HMAC cookie for self-hosted —
  `src/lib/auth/session-cookie.ts`) — both survive refresh and browser
  close/reopen inherently, since neither uses `localStorage`.
- `src/proxy.ts` (Next.js 16 renamed `middleware.ts` to `proxy.ts` — see
  `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`)
  calls `supabase.auth.getUser()`, not `getSession()`, on every request —
  this revalidates/refreshes the token server-side on the correct cadence.
- An already-authenticated user hitting `/auth/login` or `/auth/signup` is
  already redirected to `/dashboard` in both auth modes
  (`AUTH_ENTRY_ROUTES` in `proxy.ts`).
- Self-hosted password storage uses scrypt with a random salt,
  timing-safe comparison, and failed-attempt rate limiting
  (`src/lib/auth/local-auth.ts`, `src/lib/auth/rate-limit.ts`) — no
  plaintext, no shortcuts.
- `onAuthStateChange`/`getSession`/`refreshSession` are not missing by
  oversight — they lived only in an unmounted `auth-context.tsx` and were
  deliberately deleted as dead code in an earlier, documented refactor
  (`docs/self-hosting-audit.md`, "Auth coupling — powierzchnia zmalała").
  The server-first architecture (proxy.ts + `getCurrentUser()` per
  request) doesn't need a client-side listener for correctness, so this
  is not reinstated.

One real, concrete bug was found: `proxy.ts`'s `redirectToLogin()` attaches
`?redirect=<originalPath>` when bouncing an unauthenticated visitor to
`/auth/login`, but nothing reads it except the OAuth callback route.
`LoginForm` and `SignupForm` both hardcode `router.push('/dashboard')`
after a successful sign-in, in every branch (local email/password,
Supabase email/password), and `OAuthButtons` is rendered from both forms
with no `redirectTo` prop, so it falls back to its own `/dashboard`
default too. Net effect: a user redirected to login from a deep link
(e.g. a shared `/projects/<id>` URL while logged out) always lands on
`/dashboard` after authenticating, never back at the page they were
trying to reach.

Also found: `src/lib/supabase.ts` exports `SESSION_EXPIRY_HOURS`,
`SESSION_SECURITY`, and `isSupabaseConfigured` — confirmed via a
repo-wide grep to be unused anywhere else. `SESSION_SECURITY` in
particular is misleading: it reads like configured failed-attempt
lockout and session-timeout enforcement for the hosted (Supabase) path,
but nothing in the codebase ever reads it — the real rate limiting
(`src/lib/auth/rate-limit.ts`) only applies to the self-hosted path.

## Goal

- A user who gets redirected to `/auth/login` from any protected page
  lands back on that exact page after signing in, across all three
  sign-in paths (self-hosted email/password, Supabase email/password,
  Supabase OAuth) — not always `/dashboard`.
- Remove the misleading dead config from `src/lib/supabase.ts`.

Not building: reinstating `onAuthStateChange`/a client-side auth context,
changing session TTLs, changing the self-hosted rate-limit thresholds, or
any other auth-adjacent change — all deliberately out of scope per the
investigation above and the user's own confirmation to keep this phase
narrow.

## Design

### Shared redirect-validation helper

`safeRedirect()` currently lives only inside
`src/app/auth/callback/route.ts` (OAuth callback). Extract it, unchanged
in behavior, to a new `src/lib/auth/safe-redirect.ts`:

```typescript
/**
 * Only same-site paths are accepted, so a `?redirect=` value cannot be
 * used to bounce a freshly authenticated user to another origin.
 */
export function safeRedirect(value: string | null | undefined): string {
  if (!value) return "/dashboard";
  if (!value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}
```

`src/app/auth/callback/route.ts` imports this instead of defining its own
copy — one validated implementation, not two that could drift apart on a
security-relevant check.

### `LoginForm` reads and forwards `redirect`

`src/app/auth/login/login-form.tsx` already calls `useSearchParams()` for
the existing `message` param. Add reading `redirect` the same way,
resolve it through `safeRedirect()`, and use the result everywhere the
component currently hardcodes `/dashboard`:

- The local-mode branch's `router.push('/dashboard')` → `router.push(target)`.
- The Supabase email/password branch's `router.push('/dashboard')` → `router.push(target)`.
- `<OAuthButtons />` (no props today) → `<OAuthButtons redirectTo={target} />`.

### `SignupForm` — same treatment, for consistency

`src/app/auth/signup/signup-form.tsx` gets the identical change: read
`redirect`, resolve via `safeRedirect()`, apply to the local-mode
`router.push`, and pass to `<OAuthButtons redirectTo={target} />`. The
Supabase signup branch's post-signup destination
(`/auth/login?message=...`) is intentionally NOT changed to carry
`redirect` forward — a user who just signed up still needs to
authenticate on that login page, and `LoginForm`'s own `redirect` reading
(above) already covers it if `signup`'s own page was reached with one
(e.g. `/auth/signup?redirect=/projects/x` → after signing up, landing on
`/auth/login?message=...` with no `redirect` param would fall back to
`/dashboard` — but this exact path — arriving at signup with a `redirect`
already attached — did not exist before this change either, and inventing
it is unnecessary scope; a user bounced to login from a protected page
already gets a `redirect`-carrying `/auth/login` link, not a signup link).

### Dead-code removal

Delete `SESSION_EXPIRY_HOURS`, `SESSION_SECURITY`, and
`isSupabaseConfigured` from `src/lib/supabase.ts`, along with their doc
comments. Confirmed via `grep -rn "SESSION_EXPIRY_HOURS|SESSION_SECURITY|isSupabaseConfigured" --include=*.{ts,tsx}` that nothing else in the
codebase references any of the three.

### Verification

- `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- Manual/code-level walk of all three sign-in paths confirming the
  `redirect` param survives from `proxy.ts`'s bounce through to the final
  `router.push`/redirect. A live click-through requires real Supabase
  credentials this environment doesn't have (the same constraint noted
  in the Phase 1 plans) — covered by careful code-path tracing instead.

## Out of scope

- Reinstating `onAuthStateChange` or any client-side auth context.
- Changing session/token TTLs for either auth mode.
- Changing self-hosted rate-limit thresholds.
- The Supabase-signup-without-email-confirmation edge case noted above
  (self-corrects today via `proxy.ts`'s `AUTH_ENTRY_ROUTES` redirect —
  not broken, just an extra hop).
