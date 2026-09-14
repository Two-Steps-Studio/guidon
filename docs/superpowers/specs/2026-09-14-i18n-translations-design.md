# Multi-language support (English, Polish, German, Spanish)

## Problem

Guidon's UI is entirely hardcoded English text, scattered across ~70+
components under `src/app/**` and `src/components/**`. There's no i18n
library, no locale routing, and no per-user language preference. The
goal: full UI translation into Polish, German, and Spanish alongside
the existing English, with the user's language chosen automatically
(browser detection) or manually (a switcher), remembered across
sessions and devices for logged-in users. Transactional emails
(password reset, signup confirmation) should also go out in the
recipient's language. The admin panel is in scope too.

## Design

### Library: next-intl, cookie-based locale (no URL routing)

`next-intl` is used because it's built around Next.js App Router
Server Components — most of Guidon's pages are `async function
Page()` components that fetch data server-side, and `next-intl` lets
those call `getTranslations()` directly without client boilerplate.
Its ICU MessageFormat support matters concretely here: **Polish has
three plural forms** (one/few/many), not the two English has, and
getting that wrong produces grammatically broken UI, not just an
awkward string.

No URL-based locale routing (`/pl/...`) — locale is resolved from a
cookie, per the earlier decision to use profile-setting + auto-detect
instead of routing. No existing route's URL shape changes.

### Data model

New migration, `src/db/migrations/031_profile_locale.sql`:

```sql
ALTER TABLE profiles ADD COLUMN locale text NOT NULL DEFAULT 'en'
  CHECK (locale IN ('en', 'pl', 'de', 'es'));
```

Unlike `projects`, `profiles` has no column-level `GRANT UPDATE`
allowlist (confirmed by reading migrations 001/003) — it's gated by
the `profiles_update_own` RLS policy on the whole table, so no grant
list needs updating here, unlike migration 029's `methodology` column.

### Locale resolution

`src/i18n/request.ts` (next-intl's `getRequestConfig`) resolves the
active locale in this order:

1. If the request has an authenticated session (`getUser()`) and that
   user's `profiles.locale` is set, use it — this is the
   cross-device source of truth once a user has ever chosen a
   language.
2. Else, if a `NEXT_LOCALE` cookie is present, use it (set by the
   language switcher for a not-yet-logged-in visitor, or before their
   profile lookup completes).
3. Else, parse the `Accept-Language` header, pick the best match
   among `en`/`pl`/`de`/`es`, and use that — no cookie is written at
   this point; detection re-runs each request until the visitor (or
   their profile) makes an explicit choice, so a changed browser
   language is picked up automatically for a never-decided visitor.
4. Else, `en`.

### Changing language

A new Server Action, `setLocale(locale)`
(`src/app/actions/set-locale.ts`): sets the `NEXT_LOCALE` cookie, and
if the caller is authenticated, also updates `profiles.locale`
(through both dual-mode branches, matching every other profile
mutation in this codebase). A `<LanguageSwitcher>` client component
calls it; placed in two spots — the sidebar footer (always reachable)
and the profile settings page (`src/app/profile/profile-form.tsx`,
alongside the existing profile fields).

### Root layout

`src/app/layout.tsx` becomes `async`, resolves the locale via the
same mechanism as `request.ts` (next-intl exposes `getLocale()` for
this), sets `<html lang={locale}>` dynamically instead of the
hardcoded `"en"`, and wraps `{children}` in
`<NextIntlClientProvider>` so Client Components (forms, dialogs) can
call `useTranslations()` too.

### Message catalogs

`messages/{en,pl,de,es}.json`, namespaced by feature area matching
the page structure: `auth` (login/signup/forgot-password/reset-
password), `nav` (sidebar/layout chrome), `dashboard`,
`organizations`, `projects` (shared project chrome: header, tabs),
`work` (kanban board, task dialogs — including the "Workflow"
Standard/Scrum selector from the just-shipped methodology feature),
`roadmap`, `members`, `settings` (project + organization + profile
settings, including the board-columns and AI-permissions sub-forms),
`admin`, `common` (shared strings: buttons like "Cancel"/"Save",
generic error messages). English is authored first per namespace (it
already exists as hardcoded text — this is mostly extraction, not
new copy), Polish/German/Spanish are translated directly (native
translations written as part of implementation, not machine-
translated placeholders).

### Emails

`sendPasswordResetEmail` and the signup-confirmation template
(`src/lib/email/resend.ts`, `docs/supabase-email-templates/confirm-
signup.html`'s logic once it's code-driven) take an explicit
`locale` parameter rather than reading it from a request — email
sending happens in Server Actions and Supabase Auth webhooks where
there's no browser request to inspect. The locale passed is the
recipient's `profiles.locale` (falling back to `'en'` for a
not-yet-created profile, e.g. mid-signup). Subject/body come from a
`messages/emails/{locale}.json`-style lookup using next-intl's
`createTranslator()` (the non-request-bound primitive — takes
`locale` and `messages` directly, no cookie/header involved), not
`getTranslations()`, since there's no request context to read from
in that code path.

### Admin panel

In scope, using the same `admin` namespace and the same
`getTranslations()` pattern as every other Server Component page —
no special-casing needed; it's an internal-only surface, but nothing
about the i18n mechanism cares who the audience is.

### Scope and rollout

All user-facing text across `src/app/**` and `src/components/**` gets
extracted into the catalogs and swapped for `t('key')` calls — this
is the large, mechanical part of the work. It naturally batches by
feature area for implementation (auth pages; layout/nav/dashboard;
projects shared chrome + work board; roadmap + members + settings;
admin), each batch touching a self-contained set of files and their
own namespace, so batches can be implemented and reviewed
independently even though all of them ship as part of this one
round — no page is left English-only when this round finishes.

### Verification

- `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- `npm run test:db` — the new `profiles.locale` column touches the
  migration chain; must stay at or above the current baseline.
- No automated string-coverage check exists in this codebase (no
  component test runner) — verification of "did we miss a hardcoded
  string" is a manual/browser pass per batch: switch the language
  switcher through all 4 locales on each batch's pages and read the
  screen.
- Manual, needs real infrastructure: confirming password-reset/
  signup emails actually arrive in the right language requires a
  real `RESEND_API_KEY` this environment doesn't have — same
  limitation as the forgot-password feature's own verification.

## Out of scope

- Locale-aware date/number formatting beyond what `next-intl`'s ICU
  formatting gives for free inside translated strings — no separate
  audit of every `toLocaleDateString()` call site in this round.
- Translating AI-generated content (chat responses, generated
  insights) — those come from the configured AI provider in whatever
  language the user writes to it in; out of scope for UI i18n.
- RTL language support — none of the four target languages need it.
- A fifth+ language — the catalog structure supports adding one
  later without rework, but only en/pl/de/es ship this round.
