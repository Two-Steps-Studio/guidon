# Forgot Password Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a hosted-mode-only "Forgot password?" flow: request a reset by email, receive a Guidon-branded email sent by Guidon's own backend via Resend (not Supabase's dashboard-configured mailer), and set a new password.

**Architecture:** Guidon's backend calls Supabase's admin API (`generateLink`) to mint a recovery link without Supabase sending its own email, then sends the actual branded email itself via a plain `fetch` call to Resend's REST API. The recovery link routes through the app's *already-existing* `/auth/callback` route unchanged (same mechanism the OAuth flow already uses) to establish a session, landing on a new page that lets the user set a new password. Self-hosted mode has no email-sending capability at all, so this feature is completely absent there — new routes redirect away, and the login page's link is hidden — mirroring how `OAuthButtons` already hides itself in that mode.

**Tech Stack:** Next.js Server Actions, Supabase Admin API (`supabase.auth.admin.generateLink`), Resend REST API via plain `fetch` (no SDK dependency).

Reference spec: `docs/superpowers/specs/2026-09-13-forgot-password-design.md`

---

### Task 1: Resend email module

**Files:**
- Create: `src/lib/email/resend.ts`

- [ ] **Step 1: Write the Resend-sending module**

Create `src/lib/email/resend.ts`:

```typescript
import "server-only";

/** Read a required env var, or throw an error naming both it and what needs it. */
function requireEmailEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `${name} must be set to send password reset emails. See .env.example.`
    );
  }

  return value;
}

/**
 * Same visual language as the "Confirm sign up" template shipped for
 * Supabase's dashboard in an earlier round (dark card, Guidon wordmark,
 * #1d4fd8 primary-blue button) - different copy, and a real interpolated
 * link instead of a `{{ .ConfirmationURL }}` Go-template placeholder, since
 * this is sent by our own code rather than through Supabase's template
 * engine.
 */
function passwordResetEmailHtml(resetLink: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Reset your Guidon password</title>
</head>
<body style="margin:0; padding:0; background-color:#0b0d10; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0b0d10; padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px; width:100%;">
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <img src="https://useguidon.com/assets/guidon-wordmark.png" width="140" alt="Guidon" style="display:block; filter:invert(1);">
            </td>
          </tr>
          <tr>
            <td style="background-color:#101317; border:1px solid #23272e; border-radius:12px; padding:40px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding-bottom:8px;">
                    <span style="font-size:20px; font-weight:600; color:#f8fafc; line-height:1.3;">
                      Reset your password
                    </span>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-bottom:28px;">
                    <span style="font-size:14px; color:#9aa4b2; line-height:1.6;">
                      Click the button below to set a new password for your Guidon account. This link expires shortly and can only be used once.
                    </span>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-bottom:28px;">
                    <a href="${resetLink}"
                       style="display:inline-block; background-color:#1d4fd8; color:#ffffff; font-size:14px; font-weight:600; text-decoration:none; padding:12px 28px; border-radius:8px;">
                      Set new password
                    </a>
                  </td>
                </tr>
                <tr>
                  <td align="center">
                    <span style="font-size:12px; color:#64748b; line-height:1.6;">
                      Button not working? Paste this link into your browser:<br>
                      <a href="${resetLink}" style="color:#4d8dff; word-break:break-all;">${resetLink}</a>
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top:28px;">
              <span style="font-size:12px; color:#4b5563; line-height:1.6;">
                If you didn't request a password reset, you can safely ignore this email - your password won't change.
              </span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Sends the password reset email through Resend's REST API directly (a
 * plain fetch, no vendor SDK dependency - same philosophy this codebase's
 * AI providers already use for the same reason). Throws on any failure;
 * the caller (requestPasswordReset in Task 2) decides how to surface that
 * without revealing whether the recipient's email has an account.
 */
export async function sendPasswordResetEmail(
  to: string,
  resetLink: string
): Promise<void> {
  const apiKey = requireEmailEnv("RESEND_API_KEY");
  const from = requireEmailEnv("RESEND_FROM_EMAIL");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Reset your Guidon password",
      html: passwordResetEmailHtml(resetLink),
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend API error (${response.status}): ${body || response.statusText}`);
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no new errors in `src/lib/email/resend.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/email/resend.ts
git commit -m "$(cat <<'EOF'
Add a Resend-based password reset email sender

Plain fetch to Resend's REST API, no vendor SDK - same philosophy this
codebase's AI providers already use. Reads RESEND_API_KEY and
RESEND_FROM_EMAIL, throwing a clear error if either is missing (same
fail-loudly-at-use-time philosophy as requireEnv in
src/lib/ai/provider.ts). The HTML template reuses the exact visual
language already shipped for the "Confirm sign up" template (dark
card, Guidon wordmark, #1d4fd8 button) with different copy and a real
interpolated link instead of a Go-template placeholder.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Forgot-password request flow

**Files:**
- Create: `src/app/auth/forgot-password/actions.ts`
- Create: `src/app/auth/forgot-password/page.tsx`
- Create: `src/app/auth/forgot-password/forgot-password-form.tsx`

- [ ] **Step 1: Write the `requestPasswordReset` Server Action**

Create `src/app/auth/forgot-password/actions.ts`:

```typescript
"use server";

import { createServiceClient } from "@/lib/supabase-server";
import { isLockedOut, recordFailedAttempt } from "@/lib/auth/rate-limit";
import { sendPasswordResetEmail } from "@/lib/email/resend";
import { SITE_URL } from "@/lib/site-url";

export type RequestPasswordResetResult = { error: string | null };

/**
 * Never lets the caller learn whether `email` has an account: every branch
 * below - nonexistent email, rate-limited, or a real send - returns the
 * same { error: null } shape except for a genuine infrastructure failure
 * (Resend itself erroring), which is safe to surface because it happens
 * identically regardless of whether the account exists.
 */
export async function requestPasswordReset(
  email: string
): Promise<RequestPasswordResetResult> {
  const normalizedEmail = email.trim().toLowerCase();

  // Keyed with a "reset:" prefix so this doesn't share a counter with
  // rate-limit.ts's own login-lockout tracking for the same email address -
  // same module, same in-memory-per-process tradeoff already documented
  // and accepted there, different concern. Incrementing before calling
  // generateLink means a nonexistent email hit 5 times looks identical from
  // the outside to a real email hit 5 times.
  const rateLimitKey = `reset:${normalizedEmail}`;
  if (isLockedOut(rateLimitKey)) {
    return { error: "Too many reset requests for this email. Try again later." };
  }
  recordFailedAttempt(rateLimitKey);

  const supabase = createServiceClient();
  const redirectTo = `${SITE_URL}/auth/callback?redirect=${encodeURIComponent("/auth/reset-password")}`;

  const { data, error } = await supabase.auth.admin.generateLink({
    type: "recovery",
    email: normalizedEmail,
    options: { redirectTo },
  });

  if (error || !data.properties) {
    // Most commonly "user not found" - deliberately not distinguished from
    // success below, see this function's own doc comment.
    console.error("[auth] Failed to generate password reset link:", error?.message);
    return { error: null };
  }

  try {
    await sendPasswordResetEmail(normalizedEmail, data.properties.action_link);
  } catch (sendError) {
    console.error("[auth] Failed to send password reset email:", sendError);
    return { error: "Couldn't send the reset email right now. Please try again shortly." };
  }

  return { error: null };
}
```

- [ ] **Step 2: Write the forgot-password page (self-hosted gate)**

Create `src/app/auth/forgot-password/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { hasDirectDatabase } from "@/lib/db/pool";
import { ForgotPasswordForm } from "./forgot-password-form";

// hasDirectDatabase() reads DATABASE_URL, which Docker Compose sets at
// container runtime, not `npm run build` time - see login/page.tsx's own
// comment for the full reasoning; without this the self-hosted redirect
// below could get baked in as "never happens" at build time.
export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  // Self-hosted has no email-sending capability at all - this feature
  // doesn't exist there, same as OAuth doesn't.
  if (hasDirectDatabase()) {
    redirect("/auth/login");
  }

  return <ForgotPasswordForm />;
}
```

- [ ] **Step 3: Write the forgot-password form**

Create `src/app/auth/forgot-password/forgot-password-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset } from "./actions";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await requestPasswordReset(email);
      if (result.error) throw new Error(result.error);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background-secondary to-background-tertiary dark:from-background-secondary dark:to-background flex flex-col items-center justify-center gap-6 p-4">
      <Image
        src="/assets/guidon-wordmark.png"
        alt="Guidon"
        width={769}
        height={285}
        priority
        className="h-8 w-auto dark:invert"
      />
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">Reset your password</CardTitle>
          <CardDescription>
            Enter your email and we&apos;ll send you a link to reset your password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="p-3 bg-success/10 dark:bg-success/20 text-success dark:text-success text-sm rounded-md">
              If that email has an account, we&apos;ve sent a password reset link.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="john@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              {error && (
                <div className="text-sm text-destructive">
                  {error}
                </div>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Sending..." : "Send reset link"}
              </Button>
            </form>
          )}

          <div className="mt-4 text-center text-sm">
            <Link href="/auth/login" className="text-primary hover:underline">
              Back to sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: no new errors in the three new files.

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: build succeeds, `/auth/forgot-password` listed as a route. Note: this worktree may need a `.env.local` present to get past a missing-Supabase-env-vars build failure (a pre-existing environment gap unrelated to this change, hit by prior rounds' implementers too) — if so, temporarily copy `.env.local` from `C:\guidon` (gitignored, confirm with `git check-ignore -v .env.local` before copying, and delete it again afterward so nothing gets staged).

- [ ] **Step 7: Commit**

```bash
git add "src/app/auth/forgot-password"
git commit -m "$(cat <<'EOF'
Add the forgot-password request page and Server Action

requestPasswordReset() uses the admin API (generateLink) to mint a
recovery link without Supabase sending its own email, then sends the
actual branded email itself via Resend (Task 1). Never lets the
caller learn whether an email has an account - a nonexistent email,
a rate-limited request, and a real send all return the same generic
result; only a genuine Resend-side failure surfaces as an error,
since that happens identically regardless of whether the account
exists. Rate-limited by reusing rate-limit.ts's existing login-lockout
primitives with a "reset:" prefixed key, incremented before the
existence-revealing generateLink call. Self-hosted mode (no email
capability at all) redirects this whole page away, mirroring how
OAuthButtons already hides itself there.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Reset-password confirmation flow, login link, env docs

**Files:**
- Create: `src/app/auth/reset-password/page.tsx`
- Create: `src/app/auth/reset-password/reset-password-form.tsx`
- Modify: `src/app/auth/login/login-form.tsx`
- Modify: `.env.example`

- [ ] **Step 1: Write the reset-password page (session + self-hosted gate)**

Create `src/app/auth/reset-password/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { hasDirectDatabase } from "@/lib/db/pool";
import { createClient } from "@/lib/supabase-server";
import { ResetPasswordForm } from "./reset-password-form";

// Same reasoning as forgot-password/page.tsx and login/page.tsx.
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  // Self-hosted has no email-sending capability at all - this feature
  // doesn't exist there, same as OAuth doesn't.
  if (hasDirectDatabase()) {
    redirect("/auth/login");
  }

  // auth/callback/route.ts already exchanged the recovery link's code for
  // a real session before redirecting here - no session means the link was
  // invalid, expired, or already used.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  return <ResetPasswordForm />;
}
```

- [ ] **Step 2: Write the reset-password form**

Create `src/app/auth/reset-password/reset-password-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) throw updateError;

      router.push(
        "/auth/login?message=" +
          encodeURIComponent("Your password has been reset. Sign in with your new password.")
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background-secondary to-background-tertiary dark:from-background-secondary dark:to-background flex flex-col items-center justify-center gap-6 p-4">
      <Image
        src="/assets/guidon-wordmark.png"
        alt="Guidon"
        width={769}
        height={285}
        priority
        className="h-8 w-auto dark:invert"
      />
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">Set a new password</CardTitle>
          <CardDescription>
            Choose a new password for your Guidon account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm new password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            {error && (
              <div className="text-sm text-destructive">
                {error}
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Updating..." : "Update password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Add the "Forgot password?" link to the login form**

In `src/app/auth/login/login-form.tsx`, this block currently reads:

```tsx
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
```

Replace it with:

```tsx
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                {!local && (
                  <Link href="/auth/forgot-password" className="text-sm text-primary hover:underline">
                    Forgot password?
                  </Link>
                )}
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
```

`Link` is already imported at the top of this file (used by the "Sign up" link further down), so no new import is needed.

- [ ] **Step 4: Document the new env vars**

In `.env.example`, after the last line (`# GITHUB_APP_SLUG=`), append:

```
# -----------------------------------------------------
# PASSWORD RESET (hosted mode only)
# -----------------------------------------------------
# Required for the "Forgot password?" flow - self-hosted has no email
# capability at all, so this feature doesn't exist there. Guidon sends its
# own branded email via Resend's API (https://resend.com) rather than
# relying on Supabase's dashboard-configured SMTP/templates.
# RESEND_API_KEY=
# RESEND_FROM_EMAIL="Guidon <noreply@useguidon.com>"
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Lint**

Run: `npm run lint`
Expected: no new errors in the modified/new files.

- [ ] **Step 7: Build**

Run: `npm run build`
Expected: build succeeds, `/auth/reset-password` listed as a route alongside `/auth/forgot-password` from Task 2.

- [ ] **Step 8: Run the DB/RLS regression suite**

Run: `npm run test:db`
Expected: `132 pass / 0 fail` (this feature touches no schema/RLS code at all).

- [ ] **Step 9: Manual verification (necessarily limited)**

There is no running dev server and no browser tool available to you in this subagent context, and a real end-to-end test additionally requires a working `RESEND_API_KEY` (a real Resend account with a verified domain) and a Supabase project's real service-role key — neither is assumed to exist in this environment. **Skip live testing** — instead, trace through the code by hand one more time and confirm in your report:
- `requestPasswordReset` returns the exact same `{ error: null }` shape for a nonexistent email as for a real one (re-read the function once more with fresh eyes).
- The self-hosted redirects in both new `page.tsx` files are unconditional and happen before anything else runs.
- The "Forgot password?" link is correctly wrapped in `{!local && ...}`.

The controlling session will note in its own summary to the user that live email delivery can only be confirmed once `RESEND_API_KEY`/`RESEND_FROM_EMAIL` are configured in a real environment.

- [ ] **Step 10: Commit**

```bash
git add src/app/auth/reset-password src/app/auth/login/login-form.tsx .env.example
git commit -m "$(cat <<'EOF'
Add the reset-password confirmation page and login-page entry point

/auth/reset-password requires an active session (already established
by auth/callback/route.ts's existing code-exchange, unchanged) before
rendering the new-password form - no session means the recovery link
was invalid, expired, or already used, and it redirects to login.
Also self-hosted-gated the same way the forgot-password request page
already is. Adds "Forgot password?" next to the password field on the
login form, hidden in self-hosted mode alongside OAuth, and documents
RESEND_API_KEY/RESEND_FROM_EMAIL in .env.example.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

## Context

This is a hosted-mode-only feature — Guidon's self-hosted mode has no email-sending capability at all (confirmed via grep: `local-auth.ts` only uses email for format validation), so every new route redirects away when `hasDirectDatabase()` is true, exactly mirroring how `OAuthButtons` already hides itself in that mode. The recovery link deliberately routes through the *already-existing* `/auth/callback` route completely unchanged — do not modify `src/app/auth/callback/route.ts` or `src/lib/auth/safe-redirect.ts`, neither needs to change for this to work (the redirect target is just a same-site path, already supported). Design rationale: `docs/superpowers/specs/2026-09-13-forgot-password-design.md`.

## Before You Begin

If you have questions about the requirements, approach, dependencies, or anything unclear in the task description above, **ask them now** before starting work.

## Your Job

For whichever task you've been assigned:
1. Implement exactly what it specifies, in order
2. Verify implementation works (tsc, lint, build, and test:db where specified)
3. Commit your work with the exact given commit message
4. Self-review (see below)
5. Report back

**While you work:** If you encounter something unexpected or unclear, ask questions. Don't guess or make assumptions.

## Code Organization

- Follow the file structure and code given in each task exactly — this was fully specified by a prior planning phase, not left for you to design.
- If you find the plan's given code doesn't actually match the current file contents when you go to apply an edit (e.g. `login-form.tsx` in Task 3), don't force it — read the actual current file, apply the equivalent edit precisely, and note the discrepancy in your report.
- Don't restructure anything outside what the task specifies.

## When You're in Over Your Head

It is always OK to stop and say "this is too hard for me." Bad work is worse than no work.

**STOP and escalate when:**
- The current file contents differ substantially from what the plan assumed, in a way you can't confidently reconcile
- You need to understand code beyond what was provided and can't find clarity
- You feel uncertain about whether your approach is correct

**How to escalate:** Report back with status BLOCKED or NEEDS_CONTEXT, describing specifically what you're stuck on.

## Before Reporting Back: Self-Review

Review your work with fresh eyes. Ask yourself:
- Did I fully implement every step in my assigned task (except any explicitly skipped)?
- Is the code clean, and did I follow the exact code given rather than improvising?
- Did I avoid overbuilding — no extra features, no self-hosted equivalent, no UI beyond what's specified?
- Do tsc/lint/build (and test:db, for Task 3) all actually pass (paste real output, don't assume)?
- (Task 2 specifically) Does `requestPasswordReset` genuinely return the same shape whether or not the email exists?
- (Task 3 specifically) Is the self-hosted redirect unconditional and does it happen before any session check?

If you find issues during self-review, fix them now before reporting.

## Report Format

When done, report:
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- What you implemented (or what you attempted, if blocked)
- What you tested and test results (paste key output)
- Files changed
- Self-review findings (if any)
- Any issues or concerns
- The commit SHA you produced

---

## Plan self-review

**Spec coverage:**
- "Forgot password?" link, hidden in self-hosted — Task 3, Step 3. ✓
- `/auth/forgot-password` request form + `requestPasswordReset` action — Task 2. ✓
- `generateLink` (admin API, no Supabase-sent email) + `redirectTo` built from `SITE_URL` pointing back through the existing callback route — Task 2, Step 1. ✓
- No changes to `callback/route.ts`/`safe-redirect.ts` — neither file appears in any task's file list, and the plan's "Context" section explicitly calls out not touching them. ✓
- `/auth/reset-password` session gate + `updateUser` form — Task 3, Steps 1-2. ✓
- Self-hosted gating on both new pages — Task 2 Step 2, Task 3 Step 1. ✓
- Anti-enumeration (same generic result regardless of existence; rate-limit counter incremented before the existence-revealing call; only a genuine send failure surfaces as an error) — Task 2, Step 1, matches the spec's exact three-branch design. ✓
- Rate limiting reusing `rate-limit.ts` with a `reset:` prefixed key — Task 2, Step 1. ✓
- Resend module: plain fetch, required env vars, reused visual template — Task 1. ✓
- Env var documentation — Task 3, Step 4. ✓
- Verification per task (tsc/lint/build, test:db in Task 3, manual limited to hand-tracing since no live Resend/Supabase credentials are assumed) — present in every task, Task 3 Step 9 explicitly explains why live testing is skipped here. ✓

**Placeholder scan:** no TBD/TODO/"add appropriate handling" phrases; every step shows complete, copy-pasteable code or an exact command with expected output.

**Type consistency:** `requestPasswordReset(email: string): Promise<RequestPasswordResetResult>` (Task 2) is called from `forgot-password-form.tsx` exactly as `requestPasswordReset(email)` with `result.error` checked — matches. `sendPasswordResetEmail(to: string, resetLink: string): Promise<void>` (Task 1) is called from `requestPasswordReset` as `sendPasswordResetEmail(normalizedEmail, data.properties.action_link)` — matches (both `string` arguments in the same order). `isLockedOut`/`recordFailedAttempt` (Task 2) are the exact existing exports from `src/lib/auth/rate-limit.ts` (confirmed in this session's own exploration), used with a plain `string` key — matches their existing signatures (`isLockedOut(key: string): boolean`, `recordFailedAttempt(key: string): void`). `SITE_URL` (Task 2) is the exact existing export from `src/lib/site-url.ts`, a plain `string` constant — used directly in a template literal, no type mismatch.
