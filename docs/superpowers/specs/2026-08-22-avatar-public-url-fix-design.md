# Phase 3 — Avatar disappearing on refresh: root-cause fix

## Problem (confirmed in code, not assumed)

`StorageProvider.getUrl(bucket, path, expiresInSeconds = 600)` — implemented
identically in both `src/lib/storage/providers/supabase.ts` (via
`createSignedUrl`) and `src/lib/storage/providers/local.ts` (via a
self-signed HMAC query string) — **always** returns a time-limited URL that
expires in 10 minutes by default, regardless of whether the target bucket
is public or private.

`profile/actions.ts`'s `updateProfile()` uploads the avatar to a bucket it
explicitly creates as `public: true` (`ensureBucketExists("avatars", { public: true })`),
then calls `uploadFile(...)`, which calls `provider.getUrl(bucket, filePath)`
with no override — so the `avatar_url` written to `profiles.avatar_url`
(the permanent, persisted value shown everywhere via `getCurrentUser()`) is
actually a signed URL that stops working 10 minutes after upload. The
`Avatar`/`AvatarImage` component (Radix, used in `profile-form.tsx` and
`app-sidebar.tsx`) silently falls back to initials when the image 404s/403s
— which is exactly "the avatar disappears on refresh": it works right
after upload, then breaks the next time anyone loads a page with it,
because `avatar_url` in the database is a dead link.

This affects both storage backends identically (confirmed by reading both
provider implementations) — not a hosted-only or self-hosted-only bug.

`storage.ts` also exports a `getPublicUrl(bucket, filePath)` wrapper
(doc-commented "Get a public URL for a file") that delegates straight into
the same 600-second-default `provider.getUrl()` — so it doesn't actually
behave as its name promises either. It's currently unused anywhere in the
codebase (confirmed via grep), but is fixed as part of this change since
it's the natural home for "give me a real public URL" once the provider
layer actually supports one.

Confirmed via grep: `avatars` is the only bucket anywhere in the codebase
ever created with `public: true` — the scope of this fix is exactly
bounded to the avatar path, nothing else silently changes behavior.

## Design

### `StorageProvider.getUrl` gains a `public` option

`src/lib/storage/provider.ts`: change the interface from a positional
`expiresInSeconds?: number` third argument to an options object (both
current callers pass at most one optional argument today, so this is a
small, fully-traceable change):

```typescript
getUrl(
  bucket: string,
  path: string,
  options?: { expiresInSeconds?: number; public?: boolean }
): Promise<string>;
```

### Supabase provider: real public URLs for public buckets

`src/lib/storage/providers/supabase.ts`'s `getUrl()`: when
`options?.public` is true, call
`client.storage.from(bucket).getPublicUrl(safePath)` (Supabase's own
permanent, non-expiring public URL — synchronous, no sign/verify step)
instead of `createSignedUrl`. Otherwise, unchanged behavior
(`createSignedUrl(safePath, options?.expiresInSeconds ?? 600)`).

### Local provider: a very long expiry for public buckets

`src/lib/storage/providers/local.ts` has no separate "unsigned public"
code path today — every object is served through `/api/storage` with a
verified HMAC signature. Rather than building a second, unsigned serving
path (bigger surface area, a second security model to maintain for one
bucket), `getUrl()` uses a much longer expiry when `options?.public` is
true — effectively permanent (50 years) — reusing the exact same signing
and `/api/storage` verification path unchanged. This is a deliberate,
documented trade-off: "permanent" here means "signed for 50 years," not
architecturally unsigned, and that's fine because the signature/verify
cost is negligible and nothing about `/api/storage`'s security model needs
to change.

### `uploadFile` and the `getPublicUrl`/`getSignedUrl` wrappers

`src/lib/storage/storage.ts`:
- `uploadFile(bucket, filePath, file, options)` gains `options.public?: boolean`,
  threaded into its internal `provider.getUrl(bucket, filePath, { public: options?.public })` call.
- `getPublicUrl(bucket, filePath)` now actually passes `{ public: true }`
  to `provider.getUrl()`, so it behaves as its name says.
- `getSignedUrl(bucket, filePath, expiresIn)` passes
  `{ expiresInSeconds: expiresIn }` (unchanged behavior, just the new
  options-object shape).

### `profile/actions.ts`

`updateProfile()`'s `uploadFile("avatars", filePath, avatarFile, { upsert: true })`
call gains `public: true`, so newly uploaded avatars get a real permanent
URL from this point forward.

**Existing broken avatar URLs already stored in the database are not
migrated by this plan** — see "Out of scope." Any user who uploaded an
avatar before this fix has a dead link stored until they re-upload (the
form always shows an upload field; nothing prevents re-uploading).

### Verification

- `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- Code-level trace confirming `updateProfile()` → `uploadFile(..., { public: true })` → `provider.getUrl(bucket, path, { public: true })` on both providers.
- Browser check: upload an avatar (if a working Supabase/local storage
  backend is reachable in this environment — the session's established
  constraint is that live Supabase credentials aren't available here, so
  this may be a code-path trace only, same as the auth phase's
  verification).

## Out of scope

- Migrating/re-signing already-stored broken `avatar_url` values in the
  database — no migration script, no background job. A user with a
  currently-broken avatar sees initials until they re-upload once this
  ships.
- Deleting orphaned old avatar files left in storage on re-upload
  (`updateProfile` generates a fresh timestamped path per upload rather
  than overwriting the previous one, so old files accumulate) — a real,
  separate storage-hygiene issue, not the "avatar disappears" bug, and out
  of scope for this fix.
- Building a true unsigned/public serving path for the local storage
  provider — the 50-year signed-URL approach is the deliberate choice
  (see above).
- Any change to project-file or task-attachment URLs — both stay on the
  existing private/signed default (`public` defaults to `false`
  everywhere it isn't explicitly set to `true`).
