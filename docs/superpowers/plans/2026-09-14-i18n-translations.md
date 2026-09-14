# Multi-language support (EN/PL/DE/ES) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full UI translation into Polish, German, and Spanish alongside the existing English, resolved from a cookie + `profiles.locale` (no URL routing), with a switcher, covering every user-facing page (including admin) and transactional emails.

**Architecture:** `next-intl` (peer-compatible with this repo's Next 16 per `npm view next-intl peerDependencies`), request-scoped locale resolution with no URL prefix, a `profiles.locale` column for cross-device persistence, one JSON message catalog per locale nested by feature-area namespace, and a large batch of mechanical string-extraction tasks — one per feature area — each following an identical, fully worked pattern established in Task 1.

**Tech Stack:** next-intl 4.x, Next.js App Router (Server + Client Components), the existing dual-mode Postgres/Supabase data layer for `profiles.locale`.

---

## How every translation-batch task works (read once, applies to Tasks 3-14)

Every batch task below lists: a namespace name, a file list, and one fully worked example file. The procedure is identical across all of them:

1. For each file in the list, find every user-facing string: visible text (headings, labels, button text, placeholders, helper/description text, empty-state messages, toast/error messages, `alt`/`aria-label`/`title` attributes shown to a user). **Do not extract**: the "Guidon" product name, CSS class names, URLs/paths, code identifiers, console.log/console.error debug text, emoji used as pure decoration, or values that are already data (a user's own name, an email address, a tag someone typed).
2. Add each string as a key under that file's spot in the namespace, in `messages/en.json`, preserving the exact original English wording verbatim (this is extraction, not rewriting).
3. Add the same keys to `messages/pl.json`, `messages/de.json`, `messages/es.json` with natural, correctly-toned translations — not machine-literal word-for-word. Match the existing English tone (this app's UI copy is plain and direct, not formal/corporate). For Polish specifically, get plural forms right where a count is involved (see Task 1's ICU example) — one/few/many, not just singular/plural.
4. In the component, call `useTranslations(namespace)` (Client Component — file starts with `'use client'`) or `await getTranslations(namespace)` (Server Component — `async function`), then replace each hardcoded string with `t('key')`. Interpolated values (a name, a count, a date already formatted elsewhere) become ICU placeholders: `"welcome": "Welcome, {name}"` called as `t('welcome', { name })`.
5. Run `npx tsc --noEmit && npm run lint` — must stay clean (no new errors beyond this repo's existing 26-problem baseline).
6. Commit with the message given at the end of the task.

A task is NOT done if any file in its list still has a hardcoded user-facing string (other than the deliberate exclusions in step 1). Self-review by re-reading every file in the list after editing, not just the ones you remember changing.

---

### Task 1: Core i18n infrastructure

**Files:**
- Modify: `package.json` (add `next-intl`)
- Modify: `next.config.ts`
- Create: `src/i18n/request.ts`
- Create: `src/i18n/locales.ts`
- Create: `messages/en.json`, `messages/pl.json`, `messages/de.json`, `messages/es.json`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Install next-intl**

Run: `npm install next-intl@^4.14.5`

- [ ] **Step 2: Define the supported locales**

Create `src/i18n/locales.ts`:

```typescript
export const SUPPORTED_LOCALES = ["en", "pl", "de", "es"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export function isSupportedLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
```

- [ ] **Step 3: Seed the message catalogs**

Create all four files with identical structure (only `common.loading`'s value differs per language). This is the skeleton every later task adds namespaces to.

`messages/en.json`:
```json
{
  "common": {
    "loading": "Loading..."
  }
}
```

`messages/pl.json`:
```json
{
  "common": {
    "loading": "Ładowanie..."
  }
}
```

`messages/de.json`:
```json
{
  "common": {
    "loading": "Lädt..."
  }
}
```

`messages/es.json`:
```json
{
  "common": {
    "loading": "Cargando..."
  }
}
```

(Every later task adds its own namespace object alongside `common` — never replaces the file, always merges a new top-level key into the existing JSON.)

- [ ] **Step 4: Write the request-locale resolver**

Create `src/i18n/request.ts`:

```typescript
import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { createClient } from "@/lib/supabase-server";
import { hasDirectDatabase } from "@/lib/db/pool";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, isSupportedLocale, type Locale } from "./locales";

const LOCALE_COOKIE = "NEXT_LOCALE";

/**
 * Picks the best-matching supported locale from an Accept-Language header,
 * e.g. "pl-PL,pl;q=0.9,en;q=0.8" -> "pl". No cookie is written here -
 * detection re-runs every request until something explicit (a cookie or a
 * saved profile) exists, so a visitor who changes their browser language
 * before ever picking one in the app keeps getting matched correctly.
 */
function detectLocaleFromHeader(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const preferred = acceptLanguage
    .split(",")
    .map((part) => part.split(";")[0].trim().toLowerCase().split("-")[0]);
  for (const lang of preferred) {
    if (isSupportedLocale(lang)) return lang;
  }
  return DEFAULT_LOCALE;
}

export default getRequestConfig(async () => {
  let locale: Locale = DEFAULT_LOCALE;

  // 1. A logged-in user's saved preference wins - cross-device source of
  // truth once they've ever picked a language. Only queried in hosted mode
  // here; self-hosted's withUser() path needs a userId this request-config
  // callback doesn't have, so self-hosted relies on the cookie/header below
  // (getUser() still works there via the local-auth session cookie for the
  // Supabase-shaped client, see supabase-server.ts).
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("locale")
        .eq("id", user.id)
        .maybeSingle();
      if (profile?.locale && isSupportedLocale(profile.locale)) {
        locale = profile.locale;
        return { locale, messages: (await import(`../../messages/${locale}.json`)).default };
      }
    }
  } catch {
    // No session, or the query failed - fall through to cookie/header.
  }

  // 2. An explicit cookie (set by the language switcher, or by an
  // earlier visit before a profile lookup was possible).
  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (cookieLocale && isSupportedLocale(cookieLocale)) {
    locale = cookieLocale;
    return { locale, messages: (await import(`../../messages/${locale}.json`)).default };
  }

  // 3. Accept-Language header detection, no cookie written.
  locale = detectLocaleFromHeader((await headers()).get("accept-language"));

  return { locale, messages: (await import(`../../messages/${locale}.json`)).default };
});
```

Note: `hasDirectDatabase` is imported but intentionally unused in this minimal version — remove the import if your editor flags it, or keep it for a future self-hosted-specific branch; check `npx tsc`/lint in Step 6 and delete the import if it triggers a lint error, since this codebase's `no-unused-vars` rule is active (see `files-browser.tsx`'s existing pre-baseline warning for the one place this rule is currently NOT enforced — don't add a second instance).

- [ ] **Step 5: Wire the plugin into `next.config.ts`**

At the top of `next.config.ts`, add:

```typescript
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
```

And change the final line from `export default nextConfig;` to:

```typescript
export default withNextIntl(nextConfig);
```

- [ ] **Step 6: Wire the provider and dynamic `lang` into the root layout**

Modify `src/app/layout.tsx`. Change `export default function RootLayout(...)` to `export default async function RootLayout(...)`, add at the top of the function body:

```typescript
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
```

```tsx
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <body className="min-h-screen bg-background text-foreground">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <main>{children}</main>
        </NextIntlClientProvider>
      </body>
      {!hasDirectDatabase() && <GoogleAnalytics gaId={GA_MEASUREMENT_ID} />}
    </html>
  );
}
```

(Keep every other part of the file — `metadata`, font setup, `GA_MEASUREMENT_ID` — unchanged.)

- [ ] **Step 7: Verify and smoke-test**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean (build in particular matters here — this confirms `next-intl`'s plugin actually works with this repo's Next.js version, which `AGENTS.md` warns may differ from upstream in ways that break third-party assumptions).

Then start the dev server and load any page in a browser. Expected: renders exactly as before (no visible change yet — this task adds only infrastructure and one placeholder string nothing currently uses). Check the browser console for next-intl errors (a missing message key, a provider-context error) — there should be none.

**If the build or smoke test fails in a way that suggests next-intl is incompatible with this Next.js fork**, stop and report BLOCKED rather than working around it — this would mean the whole plan's library choice needs to be revisited, which is a decision for the plan's author (the human), not a per-task judgment call.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json next.config.ts src/i18n/ messages/ src/app/layout.tsx
git commit -m "Add next-intl infrastructure (cookie + profile locale resolution, no URL routing)"
```

---

### Task 2: profiles.locale + language switcher

**Files:**
- Create: `src/db/migrations/031_profile_locale.sql`
- Create: `src/app/actions/set-locale.ts`
- Create: `src/components/layout/language-switcher.tsx`
- Modify: `src/components/layout/app-sidebar.tsx`
- Modify: `src/app/profile/profile-form.tsx`

- [ ] **Step 1: Migration**

```sql
-- ============================================================
-- GUIDON - MIGRACJA 031
-- Preferowany jezyk uzytkownika (profiles.locale)
-- ============================================================
--
-- Uruchomic PO 030.
--
-- Zrodlo prawdy dla jezyka interfejsu zalogowanego uzytkownika, czytane
-- przez src/i18n/request.ts. Bez restrykcji GRANT UPDATE per-kolumna -
-- profiles (w odroznieniu od projects, 023/029) nigdy takiej listy nie
-- mialo, caly UPDATE jest bramkowany polityka profiles_update_own (001),
-- wiec nowa kolumna nie wymaga zadnej dodatkowej zmiany GRANT.
-- ============================================================

BEGIN;


ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'en'
    CHECK (locale IN ('en', 'pl', 'de', 'es'));


COMMIT;
```

- [ ] **Step 2: Verify the migration in isolation**

Run: `npm run test:db`
Expected: pass count is one higher than before this task (the migration-chain test counts every migration file that applies cleanly), 0 fail.

- [ ] **Step 3: `setLocale` Server Action**

Create `src/app/actions/set-locale.ts`:

```typescript
"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { isSupportedLocale } from "@/i18n/locales";

const LOCALE_COOKIE = "NEXT_LOCALE";

export async function setLocale(locale: string): Promise<{ error: string | null }> {
  if (!isSupportedLocale(locale)) {
    return { error: "Unsupported language." };
  }

  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  // Best-effort: an anonymous visitor changing the switcher before logging
  // in has no profile row to update yet - the cookie alone is enough for
  // them, and this silently no-ops rather than erroring.
  if (hasDirectDatabase()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await withUser(user.id, ({ query }) =>
        query("UPDATE profiles SET locale = $1 WHERE id = $2", [locale, user.id])
      );
    }
  } else {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("profiles").update({ locale }).eq("id", user.id);
    }
  }

  revalidatePath("/", "layout");
  return { error: null };
}
```

- [ ] **Step 4: Language switcher component**

Create `src/components/layout/language-switcher.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { useLocale } from "next-intl";
import { setLocale } from "@/app/actions/set-locale";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SUPPORTED_LOCALES } from "@/i18n/locales";

const LOCALE_LABELS: Record<string, string> = {
  en: "English",
  pl: "Polski",
  de: "Deutsch",
  es: "Español",
};

export function LanguageSwitcher() {
  const currentLocale = useLocale();
  const [isPending, startTransition] = useTransition();

  return (
    <Select
      value={currentLocale}
      disabled={isPending}
      onValueChange={(value) => {
        startTransition(async () => {
          await setLocale(value);
        });
      }}
    >
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SUPPORTED_LOCALES.map((locale) => (
          <SelectItem key={locale} value={locale}>
            {LOCALE_LABELS[locale]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

(Confirm `@/components/ui/select` exists with this exact export shape via `grep -rn "SelectTrigger" src/components/ui/select.tsx` before assuming — it's shadcn/ui, already used elsewhere in this codebase, e.g. the board sort-mode toggle in `work-board.tsx`.)

- [ ] **Step 5: Add it to the sidebar footer**

In `src/components/layout/app-sidebar.tsx`, import `LanguageSwitcher` and render it inside `SidebarFooter`, near the existing logout link added in an earlier round (read the file first — place it as its own `SidebarMenuItem` or a plain wrapped block, matching whatever structure is already there for the logout link and profile link, don't restructure the rest of the footer).

- [ ] **Step 6: Add it to the profile settings page**

In `src/app/profile/profile-form.tsx`, add a "Language" field rendering `<LanguageSwitcher />` near the other profile fields (read the file first — match its existing `<Label>`/field-wrapper pattern, e.g. the same `space-y-2` block style used in `settings-form.tsx` from the project-methodology round).

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/db/migrations/031_profile_locale.sql src/app/actions/set-locale.ts src/components/layout/language-switcher.tsx src/components/layout/app-sidebar.tsx src/app/profile/profile-form.tsx
git commit -m "Add profiles.locale, setLocale action, and a language switcher"
```

---

### Task 3: Auth pages (`auth` namespace)

**Files:** `src/app/auth/login/{page,login-form}.tsx`, `src/app/auth/signup/{page,signup-form}.tsx`, `src/app/auth/forgot-password/{page,forgot-password-form}.tsx`, `src/app/auth/reset-password/{page,reset-password-form}.tsx`, `src/app/auth/logout/{page,logout-client}.tsx`

**Worked example** — `src/app/auth/logout/logout-client.tsx` (Client Component):

Add to `messages/en.json` under a new top-level `"auth"` key:
```json
"auth": {
  "logout": {
    "signingOut": "Signing out..."
  }
}
```
`messages/pl.json`: `"logout": { "signingOut": "Wylogowywanie..." }`
`messages/de.json`: `"logout": { "signingOut": "Abmelden..." }`
`messages/es.json`: `"logout": { "signingOut": "Cerrando sesión..." }`

In the component:
```tsx
"use client";
import { useTranslations } from "next-intl";
// ...
export function LogoutClient({ local }: { local: boolean }) {
  const t = useTranslations("auth.logout");
  // ...unchanged logic...
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
        <p className="text-muted-foreground">{t("signingOut")}</p>
      </div>
    </div>
  );
}
```

Apply the identical pattern (per the shared procedure above) to the remaining 9 files, nesting each page's strings under `auth.login`, `auth.signup`, `auth.forgotPassword`, `auth.resetPassword`. `login-form.tsx` and `signup-form.tsx` also render an error string sourced from `searchParams`/action state (`{state.error}` / `{error}`) — those are server-produced error messages, not UI copy; leave them as-is, don't attempt to translate error text that already comes from Supabase or a Server Action's own message.

Commit: `git commit -m "Translate auth pages"`

---

### Task 4: Layout, navigation, dashboard, landing (`nav`, `dashboard`, `landing` namespaces)

**Files:** `src/components/layout/app-shell.tsx`, `src/components/layout/app-sidebar.tsx`, `src/components/layout/project-switcher.tsx`, `src/app/error.tsx`, `src/app/page.tsx`, `src/app/pricing-section.tsx`, `src/app/dashboard/page.tsx`

**Worked example** — `src/app/error.tsx` (read it first for its exact current shape; it's small). Extract its heading/body/retry-button text into a new `"errors"` top-level namespace (e.g. `errors.generic.title`, `errors.generic.retry`) rather than nesting under `nav`, since a global error boundary isn't really "navigation" — use your judgment on namespace naming for files that don't fit an obvious existing bucket, but stay consistent: once you pick `errors` for this file, don't also create a near-duplicate `error` namespace elsewhere in this task.

Apply the shared procedure to the rest: `app-shell.tsx`/`app-sidebar.tsx`/`project-switcher.tsx` under `nav` (note: `app-sidebar.tsx` was already touched in Task 2 for the language switcher — add to the same file, don't revert that), `page.tsx`/`pricing-section.tsx` under `landing`, `dashboard/page.tsx` under `dashboard`.

`app-sidebar.tsx` and `page.tsx` are larger files with many strings (navigation labels, pricing tiers, feature descriptions) — take the time to find all of them; this is the highest-traffic UI in the app.

Commit: `git commit -m "Translate layout, navigation, dashboard, and landing page"`

---

### Task 5: Organizations (`organizations` namespace)

**Files:** all 11 files under `src/app/organizations/` listed by `find src/app/organizations -name "*.tsx"`.

**Worked example**: pick the smallest file in this list (check with `wc -l`) and fully translate it first, following the shared procedure, before moving to the rest — this task doesn't get a pre-written example because the exact file shapes should be read fresh rather than assumed from an earlier planning pass.

Nest under `organizations`, sub-nested by file purpose (`organizations.list`, `organizations.create`, `organizations.settings`, `organizations.members`, `organizations.billing`).

Commit: `git commit -m "Translate organizations pages"`

---

### Task 6: Projects shared chrome (`projects` namespace)

**Files:** `src/app/projects/page.tsx`, `src/app/projects/[id]/layout.tsx`, `src/app/projects/[id]/page.tsx`, `src/app/projects/[id]/edit-project-dialog.tsx`, `src/app/projects/import-project-dialog.tsx`, `src/app/organizations/[id]/create-project-dialog.tsx`

Note `create-project-dialog.tsx` also lives under `organizations/[id]/` (already in Task 5's file list for its own organizations-flavored strings, if any exist there beyond the project-creation form) — if Task 5 already fully translated it, skip re-doing it here; if not, do it here under `projects.create` since its content is about project creation, not organization management. Use `grep -rn "useTranslations\|getTranslations" src/app/organizations/[id]/create-project-dialog.tsx` to check before starting.

This file also has the "Workflow" (Standard/Scrum) radio group from the just-shipped methodology feature and the "Project Type" dropdown — both need their labels and the helper text ("Scrum adds sprints...") translated too, not just the surrounding form chrome.

Commit: `git commit -m "Translate projects shared chrome"`

---

### Task 7: Work board (`work` namespace)

**Files:** `src/app/projects/[id]/work/{page,work-board,ai-task-chat}.tsx`, `src/components/work/{kanban-board,task-attempts-section,task-card,task-detail-dialog,task-why-panel}.tsx`

This is one of the largest, most interactive batches — task statuses, priority labels, the sort-mode/filter selects added in earlier rounds, empty-column messages, the AI chat panel's own strings. Read `src/lib/work/task-board.ts`'s `BOARD_COLUMNS`/status-label constants first (`grep -n "label" src/lib/work/task-board.ts`) — column/status labels may already be centralized there rather than inline in JSX; if so, translate by making that lookup locale-aware (a small function taking `t` and the status, rather than a static object), not by duplicating the labels into every consuming component.

Commit: `git commit -m "Translate work board and task components"`

---

### Task 8: Roadmap and members (`roadmap`, `members` namespaces)

**Files:** `src/app/projects/[id]/roadmap/{page,create-phase-dialog,phase-card-menu,phase-form-fields}.tsx`, `src/app/projects/[id]/members/{page,member-list}.tsx`

**Worked example** — `src/app/projects/[id]/roadmap/phase-card-menu.tsx` (141 lines, a dropdown menu — read it, extract its menu-item labels and any confirm-dialog text under `roadmap.phaseMenu`).

Commit: `git commit -m "Translate roadmap and members pages"`

---

### Task 9: Project settings (`settings` namespace)

**Files:** `src/app/projects/[id]/settings/{page,settings-form,ai-permissions-form,board-columns-form,export-project-card}.tsx`

`settings-form.tsx` was heavily modified in the just-shipped project-methodology round (status/project-type/methodology selects, danger zone) — translate the "Workflow" field's label and helper text added there too, under `settings.workflow`, alongside everything else in the file.

Commit: `git commit -m "Translate project settings pages"`

---

### Task 10: Context, decisions, knowledge (`context`, `decisions`, `knowledge` namespaces)

**Files:** `src/app/projects/[id]/context/{page,context-tabs,create-relation-dialog,relation-row}.tsx`, `src/app/projects/[id]/decisions/{page,create-decision-dialog,decision-card-menu,decision-form-fields}.tsx`, `src/app/projects/[id]/knowledge/{page,knowledge-list,create-source-dialog,source-card-menu,source-form-fields}.tsx`

Three related but independent features sharing one task for batching efficiency — use three separate namespaces (`context`, `decisions`, `knowledge`), not one merged namespace, since they're conceptually distinct pages.

Commit: `git commit -m "Translate context, decisions, and knowledge pages"`

---

### Task 11: Files, memory, technology, activity, tasks (`files`, `memory`, `technology`, `activity`, `tasks` namespaces)

**Files:** `src/app/projects/[id]/files/{page,files-browser,connect-repo/page,connect-repo/repo-picker}.tsx`, `src/app/projects/[id]/memory/{page,create-memory-dialog,generate-insight-button,insight-review-card,memory-card-menu}.tsx`, `src/app/projects/[id]/technology/{page,technology-list}.tsx`, `src/app/projects/[id]/activity/page.tsx`, `src/app/projects/[id]/tasks/page.tsx`

Five namespaces, same rule as Task 10 — keep them separate even though they're one task for batching.

`files-browser.tsx` has a pre-existing unused-var lint warning (`projectColor`, part of this repo's known 26-problem baseline) — don't fix it as part of this task (out of scope), just don't let your edits make lint treat it any differently (still exactly one warning from this file afterward).

Commit: `git commit -m "Translate files, memory, technology, activity, and tasks pages"`

---

### Task 12: Admin panel (`admin` namespace)

**Files:** all 8 files under `src/app/admin/` listed by `find src/app/admin -name "*.tsx"`.

Internal-only surface, but gets the same full treatment — no special-casing. `admin/page.tsx` (206 lines) is the largest single file in this batch; read it fully before starting rather than skimming.

Commit: `git commit -m "Translate admin panel"`

---

### Task 13: Profile (`profile` namespace)

**Files:** `src/app/profile/{page,profile-form,api-keys}.tsx`

`profile-form.tsx` was already touched in Task 2 (added the language switcher) — add this task's translation work to the same file, don't revert Task 2's addition. The switcher's own "Language" label (if you added one in Task 2) belongs under `profile` too — go back and wrap it in `t(...)` now if Task 2 left it as a hardcoded string, since Task 2 predates this namespace existing.

Commit: `git commit -m "Translate profile pages"`

---

### Task 14: Transactional emails (`emails` namespace)

**Files:**
- Modify: `src/lib/email/resend.ts`
- Modify: `src/app/auth/forgot-password/actions.ts`
- Modify: `docs/supabase-email-templates/confirm-signup.html`-equivalent code path (find it: `grep -rln "Confirm sign up\|confirmation" src/lib/email/ src/app --include="*.ts"` — if signup confirmation is still Supabase-dashboard-templated rather than code-driven, this task only touches the password-reset email; leave signup confirmation as an explicitly out-of-scope note in the commit message rather than guessing at a dashboard template's structure)

- [ ] **Step 1: Add an `emails` namespace to all four message files**

Structure (English shown; translate naturally for pl/de/es):
```json
"emails": {
  "passwordReset": {
    "subject": "Reset your Guidon password",
    "heading": "Reset your password",
    "body": "Set a new password for your Guidon account.",
    "cta": "Reset password",
    "ignoreNotice": "If you didn't request this, you can safely ignore this email."
  }
}
```
(Match the exact copy already in `sendPasswordResetEmail`'s template in `resend.ts` — read it first, this is extraction of existing copy, not new writing.)

- [ ] **Step 2: Make `sendPasswordResetEmail` locale-aware**

`resend.ts`'s `sendPasswordResetEmail` currently takes `(to: string, resetLink: string)`. Add a third parameter `locale: Locale = DEFAULT_LOCALE`. Since this runs outside any request context (no cookies/headers to read), use `next-intl`'s non-request-bound translator instead of `getTranslations()`:

```typescript
import { createTranslator } from "next-intl";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/locales";

async function loadMessages(locale: Locale) {
  return (await import(`../../../messages/${locale}.json`)).default;
}

export async function sendPasswordResetEmail(
  to: string,
  resetLink: string,
  locale: Locale = DEFAULT_LOCALE
): Promise<void> {
  const messages = await loadMessages(locale);
  const t = createTranslator({ locale, messages, namespace: "emails.passwordReset" });
  // Use t("subject"), t("heading"), t("body"), t("cta"), t("ignoreNotice")
  // in place of the hardcoded strings currently in this function's HTML
  // template and the `subject` field of the Resend API request body.
  // ...rest of the function's existing fetch-to-Resend logic unchanged...
}
```

(Adjust the relative import path to `messages/` based on this file's actual location under `src/lib/email/` — verify with `ls` before assuming `../../../` is correct.)

- [ ] **Step 3: Pass the recipient's locale from `requestPasswordReset`**

In `src/app/auth/forgot-password/actions.ts`, `requestPasswordReset` currently calls `sendPasswordResetEmail(normalizedEmail, resetLink)`. Before that call, look up the user's `profiles.locale` the same way `generateLink`'s admin client already has access (via `createServiceClient()`, already imported in this file) — query `profiles` by the email or by the id `generateLink`'s response includes, and pass the result (or `undefined` if no profile exists yet, letting the default apply) as the third argument.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean. Real end-to-end email-language verification needs a working `RESEND_API_KEY`, which this environment doesn't have — same limitation noted in the spec; leave it as a manual step for the user.

- [ ] **Step 5: Commit**

```bash
git add messages/ src/lib/email/resend.ts src/app/auth/forgot-password/actions.ts
git commit -m "Send password-reset emails in the recipient's language"
```

---

### Task 15: Full verification

- [ ] **Step 1: Automated checks**

Run: `npx tsc --noEmit && npm run lint && npm run build && npm run test:db`
Expected: `tsc`/`build` clean, `lint` at the pre-existing 26-problem baseline (no new errors in any file this plan touched — cross-check the lint output's file list against every file named across Tasks 1-14), `test:db` at or above the pass count from before Task 2's migration (which added one to whatever the baseline was at the start of this plan).

- [ ] **Step 2: Manual multi-locale browser pass**

Start the dev server. For each of the 4 locales (switch via the language-switcher built in Task 2, or by pre-setting the `NEXT_LOCALE` cookie):
1. Load the landing page, login, and dashboard — confirm no English text leaks through on a non-English locale and no raw translation keys (literal strings like `auth.login.title`) render anywhere, which would mean a missing catalog entry.
2. Spot-check one page from each batch task (auth, nav/dashboard, organizations, projects/work, roadmap/members, settings, context/decisions/knowledge, files/memory/technology, admin, profile).
3. Confirm the `<html lang>` attribute matches the active locale (check via browser dev tools or `read_page`).
4. Confirm switching locale via the sidebar switcher and via the profile page both work and persist across a reload.

- [ ] **Step 3: If everything above passes, this plan is complete — proceed to superpowers:finishing-a-development-branch.**
