# Phase 2 Implementation Plan: Auth Redirect Fix + Dead-Code Cleanup

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A user bounced to `/auth/login` from a protected page lands back on that exact page after signing in, across all three sign-in paths — not always `/dashboard`. Remove unused, misleading session-config constants.

**Architecture:** Extract the existing `safeRedirect()` validator (currently duplicated nowhere, but living only in the OAuth callback route) into a shared helper; wire `LoginForm`/`SignupForm` to read the `?redirect=` query param `proxy.ts` already sets and thread it through to every `router.push`/`<OAuthButtons>` call that currently hardcodes `/dashboard`.

**Tech Stack:** Next.js App Router client components, `next/navigation`'s `useSearchParams`.

Spec: `docs/superpowers/specs/2026-08-22-auth-redirect-fix-design.md`

---

### Task 1: Shared `safeRedirect` helper

**Files:**
- Create: `src/lib/auth/safe-redirect.ts`
- Modify: `src/app/auth/callback/route.ts`

- [ ] **Step 1: Write the helper**

Create `src/lib/auth/safe-redirect.ts`:

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

- [ ] **Step 2: Point the OAuth callback route at it**

In `src/app/auth/callback/route.ts`, add the import:

```typescript
import { safeRedirect } from "@/lib/auth/safe-redirect";
```

Delete the route's own local `safeRedirect` function (currently the last
17 lines of the file, `function safeRedirect(value: string | null): string { ... }`) — the imported one is behaviorally identical, so the one call site (`const redirect = safeRedirect(searchParams.get("redirect"));`) needs no change beyond the import.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/auth/safe-redirect.ts src/app/auth/callback/route.ts
git commit -m "Extract safeRedirect into a shared helper"
```

---

### Task 2: `LoginForm` reads and forwards `redirect`

**Files:**
- Modify: `src/app/auth/login/login-form.tsx`

- [ ] **Step 1: Read and resolve the param**

Add the import (alongside the existing `next/navigation` import):

```typescript
import { safeRedirect } from "@/lib/auth/safe-redirect"
```

Add a line right after the existing `const message = searchParams.get("message")` (line 30):

```typescript
  const redirectTarget = safeRedirect(searchParams.get("redirect"))
```

- [ ] **Step 2: Use it in both sign-in branches**

Replace the local-mode branch's `router.push('/dashboard')` (currently line 41):

```typescript
        router.push(redirectTarget)
```

Replace the Supabase branch's `router.push('/dashboard')` (currently line 54):

```typescript
      router.push(redirectTarget)
```

- [ ] **Step 3: Pass it to `OAuthButtons`**

Replace the current `<OAuthButtons />` call (currently line 120):

```typescript
              <OAuthButtons redirectTo={redirectTarget} />
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/auth/login/login-form.tsx
git commit -m "LoginForm: honor the ?redirect= param instead of always going to /dashboard"
```

---

### Task 3: `SignupForm` reads and forwards `redirect`

**Files:**
- Modify: `src/app/auth/signup/signup-form.tsx`

- [ ] **Step 1: Add `useSearchParams` and read/resolve the param**

`SignupForm` does not currently call `useSearchParams()` at all (only
`LoginForm` does, for `message`). Add the import:

```typescript
import { useRouter, useSearchParams } from "next/navigation"
import { safeRedirect } from "@/lib/auth/safe-redirect"
```

(replacing the current `import { useRouter } from "next/navigation"` line).

Inside the component, right after `const router = useRouter()`:

```typescript
  const searchParams = useSearchParams()
  const redirectTarget = safeRedirect(searchParams.get("redirect"))
```

- [ ] **Step 2: Use it in the local-mode branch**

Replace the local-mode branch's `router.push('/dashboard')` (currently
line 33):

```typescript
        router.push(redirectTarget)
        return
```

(the `return` on the following line is unchanged, shown here only for
context — only the `router.push` argument changes).

- [ ] **Step 3: Pass it to `OAuthButtons`**

Replace the current `<OAuthButtons />` call (currently line 133):

```typescript
              <OAuthButtons redirectTo={redirectTarget} />
```

- [ ] **Step 4: Leave the Supabase-signup branch's destination unchanged**

The Supabase branch's `router.push('/auth/login?message=Check your email to confirm your account')` (currently line 60) is intentionally NOT modified — see the spec's reasoning (a fresh `/auth/signup?redirect=X` visit has no equivalent carry-forward path today, and inventing one is out of scope for this phase).

- [ ] **Step 5: Wrap the page in `Suspense`, since `useSearchParams` now requires it**

`useSearchParams()` opts a client component out of static rendering
unless an ancestor has a `Suspense` boundary. Confirmed by reading it
during this plan's research: `src/app/auth/signup/page.tsx` does NOT
currently wrap `SignupForm` in one (unlike `src/app/auth/login/page.tsx`,
which already does this for `LoginForm`). Replace
`src/app/auth/signup/page.tsx` in full:

```typescript
import { Suspense } from "react";
import { hasDirectDatabase } from "@/lib/db/pool";
import { SignupForm } from "./signup-form";

// See src/app/auth/login/page.tsx for why this must not be statically
// prerendered — DATABASE_URL is a runtime-only env var under Docker Compose.
export const dynamic = "force-dynamic";

export default function SignupPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SignupForm local={hasDirectDatabase()} />
    </Suspense>
  );
}
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/auth/signup/signup-form.tsx src/app/auth/signup/page.tsx
git commit -m "SignupForm: honor the ?redirect= param instead of always going to /dashboard"
```

---

### Task 4: Remove unused session-config dead code

**Files:**
- Modify: `src/lib/supabase.ts`

- [ ] **Step 1: Verify nothing references the three exports**

Run: `grep -rn "SESSION_EXPIRY_HOURS\|SESSION_SECURITY\|isSupabaseConfigured" --include=*.ts --include=*.tsx src/`
Expected: only the three declaration lines inside `src/lib/supabase.ts` itself — no other call site anywhere.

- [ ] **Step 2: Delete the three exports and their comments**

In `src/lib/supabase.ts`, delete everything from the `// Export a flag to check if Supabase is configured` comment (currently line 6) through the end of the `SESSION_SECURITY` object (currently line 46) EXCEPT the `createClient` function itself, which stays. The file should read, in full, after this change:

```typescript
import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Create a Supabase client for browser-side use
 * Call this function inside components, not at import time
 */
export function createClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase is not configured. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your .env.local file.');
  }
  
  // Basic URL validation
  try {
    new URL(supabaseUrl);
  } catch {
    throw new Error(`Invalid Supabase URL: "${supabaseUrl}". Must be a valid HTTP or HTTPS URL (e.g., https://your-project.supabase.co)`);
  }
  
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase.ts
git commit -m "Remove unused SESSION_EXPIRY_HOURS/SESSION_SECURITY/isSupabaseConfigured"
```

---

### Task 5: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Type-check, lint, build**

```bash
npx tsc --noEmit
npm run lint
npm run build
```

Expected: `tsc` clean. `lint` shows only the same pre-existing
`no-explicit-any` debt documented in the prior two plans this
session — no new errors. `build` succeeds, including `/auth/login`,
`/auth/signup`, and `/auth/callback`.

- [ ] **Step 2: Trace all three redirect paths by reading the final code**

Confirm, by reading the committed files:
- `proxy.ts`'s `redirectToLogin()` and its self-hosted equivalent both
  still set `?redirect=<pathname>` (unchanged by this plan — just confirm
  it wasn't accidentally touched).
- `LoginForm` and `SignupForm` both resolve that param through
  `safeRedirect()` and use the result in every `router.push`/`OAuthButtons`
  call site touched in Tasks 2–3.
- `src/app/auth/callback/route.ts` still imports and uses the shared
  `safeRedirect()` (Task 1) with identical behavior to before the
  extraction.

- [ ] **Step 3: Browser check, if the Browser pane cooperates**

Start the dev server, navigate directly to a protected URL while logged
out (e.g. `/dashboard`), confirm the browser lands on
`/auth/login?redirect=%2Fdashboard` (or similar), and inspect the login
form's rendered markup / `OAuthButtons` for evidence the redirect target
is threaded through — a full login round-trip isn't possible without
real credentials in this environment (same constraint as the two prior
plans this session), so this step is a static/DOM check, not a live
authenticated click-through.
