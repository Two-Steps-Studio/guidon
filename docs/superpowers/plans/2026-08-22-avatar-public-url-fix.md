# Phase 3 Implementation Plan: Avatar Public URL Fix

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `profiles.avatar_url` is a permanent (or effectively permanent) URL after this change, not a 10-minute signed URL — fixes the avatar disappearing after any page refresh past that window.

**Architecture:** `StorageProvider.getUrl()` gains a `public` option; both providers honor it (Supabase: real `getPublicUrl()`; local: a 50-year signed URL, reusing the existing signing path unchanged); `uploadFile()` threads it through; `profile/actions.ts` sets it for avatar uploads.

Spec: `docs/superpowers/specs/2026-08-22-avatar-public-url-fix-design.md`

---

### Task 1: `StorageProvider` interface — options object

**Files:**
- Modify: `src/lib/storage/provider.ts`

- [ ] **Step 1: Change the `getUrl` signature**

Replace the interface method (currently lines 42-51):

```typescript
  /**
   * A URL the browser can fetch. `public: true` returns a permanent (or
   * effectively permanent) URL for a bucket created with `public: true`;
   * otherwise a time-limited signed URL, `expiresInSeconds` (default 600).
   */
  getUrl(
    bucket: string,
    path: string,
    options?: { expiresInSeconds?: number; public?: boolean }
  ): Promise<string>;
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/storage/provider.ts
git commit -m "StorageProvider.getUrl: options object with a public flag"
```

(No type-check yet — the two implementations don't match the new
interface until Task 2, so `tsc` is expected to fail until then. Run it
after Task 2 instead.)

---

### Task 2: Both provider implementations honor `public`

**Files:**
- Modify: `src/lib/storage/providers/supabase.ts`
- Modify: `src/lib/storage/providers/local.ts`

- [ ] **Step 1: Supabase provider**

Replace `getUrl()` (currently lines 85-102):

```typescript
  async getUrl(
    bucket: string,
    path: string,
    options?: { expiresInSeconds?: number; public?: boolean }
  ): Promise<string> {
    assertSafeBucket(bucket);
    const safePath = assertSafeStoragePath(path);

    const client = createServiceClient();

    if (options?.public) {
      const { data } = client.storage.from(bucket).getPublicUrl(safePath);
      return data.publicUrl;
    }

    const { data, error } = await client.storage
      .from(bucket)
      .createSignedUrl(safePath, options?.expiresInSeconds ?? 600);

    if (error) throw error;
    if (!data?.signedUrl) throw new Error(`Could not sign URL for ${safePath}`);

    return data.signedUrl;
  }
```

- [ ] **Step 2: Local provider**

Replace `getUrl()` (currently lines 102-122):

```typescript
  /**
   * Signed URL pointing at the application's own storage route. The signature
   * covers bucket, path and expiry, so a URL cannot be edited to reach another
   * object or to extend its own lifetime.
   *
   * `public: true` doesn't add a separate unsigned serving path — it just
   * signs for PUBLIC_URL_TTL_SECONDS (50 years) instead of the normal
   * 10-minute default, so /api/storage's verification is unchanged either
   * way. That's the whole fix for the avatars bucket: a permanent-in-practice
   * URL using the same signing/verification code as every other object.
   */
  async getUrl(
    bucket: string,
    objectPath: string,
    options?: { expiresInSeconds?: number; public?: boolean }
  ): Promise<string> {
    assertSafeBucket(bucket);
    const safePath = assertSafeStoragePath(objectPath);

    const ttl = options?.public
      ? PUBLIC_URL_TTL_SECONDS
      : options?.expiresInSeconds ?? 600;
    const expires = Math.floor(Date.now() / 1000) + ttl;
    const signature = signStoragePath(bucket, safePath, expires);

    const params = new URLSearchParams({
      bucket,
      path: safePath,
      expires: String(expires),
      signature,
    });

    const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
    return `${base}/api/storage?${params.toString()}`;
  }
```

Add the new constant near the top of the file, alongside the class (before `export class LocalStorageProvider`):

```typescript
/** Effectively permanent — see getUrl()'s `public` option. */
const PUBLIC_URL_TTL_SECONDS = 50 * 365 * 24 * 60 * 60;
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (both implementations now match the Task 1 interface).

- [ ] **Step 4: Commit**

```bash
git add src/lib/storage/providers/supabase.ts src/lib/storage/providers/local.ts
git commit -m "Both storage providers honor getUrl's public option"
```

---

### Task 3: `storage.ts` — thread `public` through `uploadFile`, fix `getPublicUrl`/`getSignedUrl`

**Files:**
- Modify: `src/lib/storage/storage.ts`

- [ ] **Step 1: `uploadFile` gains a `public` option**

Replace the function signature and its `getUrl` call (currently lines 81-112):

```typescript
export async function uploadFile(
  bucket: string,
  filePath: string,
  file: File,
  options?: {
    upsert?: boolean;
    contentType?: string;
    public?: boolean;
  }
) {
  const provider = await getStorageProvider();

  try {
    await provider.upload(bucket, filePath, file, {
      upsert: options?.upsert ?? false,
      contentType: options?.contentType ?? file.type,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Storage] Upload error:', message);

    if (/bucket not found|nosuchbucket|enoent/i.test(message)) {
      throw new Error(
        `Storage bucket '${bucket}' does not exist or is not accessible.`
      );
    }
    throw new Error(`Upload failed: ${message}`);
  }

  return {
    path: filePath,
    publicUrl: await provider.getUrl(bucket, filePath, { public: options?.public }),
  };
}
```

- [ ] **Step 2: Fix `getPublicUrl` to actually request a public URL**

Replace (currently lines 244-247):

```typescript
export async function getPublicUrl(bucket: string, filePath: string): Promise<string> {
  const provider = await getStorageProvider();
  return provider.getUrl(bucket, filePath, { public: true });
}
```

- [ ] **Step 3: Update `getSignedUrl` for the new options shape**

Replace the `provider.getUrl` call inside `getSignedUrl` (currently line 260):

```typescript
    return await provider.getUrl(bucket, filePath, { expiresInSeconds: expiresIn });
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/storage.ts
git commit -m "storage.ts: thread the public option through uploadFile/getPublicUrl"
```

---

### Task 4: `profile/actions.ts` — request a public URL for avatars

**Files:**
- Modify: `src/app/profile/actions.ts`

- [ ] **Step 1: Add `public: true` to the avatar upload call**

Replace (currently line 65):

```typescript
      const uploadResult = await uploadFile("avatars", filePath, avatarFile, { upsert: true, public: true });
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/profile/actions.ts
git commit -m "Request a permanent public URL when uploading an avatar"
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
`no-explicit-any` debt from the prior plans this session — no new
errors. `build` succeeds.

- [ ] **Step 2: Confirm the two other `uploadFile` callers are unaffected**

Run: `grep -n "uploadFile(" src/lib/storage/storage.ts`
Expected: `uploadProjectFile` and `uploadTaskAttachment` (the two other
callers inside this same file) still call `uploadFile(...)` without a
`public` option — confirming they keep the private/signed default
behavior, unchanged by this plan.

- [ ] **Step 3: Trace the fix end-to-end by reading the final files**

Confirm: `updateProfile()` → `uploadFile("avatars", ..., { public: true })`
→ `provider.getUrl(bucket, filePath, { public: true })` → Supabase
provider calls `getPublicUrl()` (no expiry) OR local provider signs for
`PUBLIC_URL_TTL_SECONDS`.

- [ ] **Step 4: Browser check, if a working storage backend is reachable**

Same constraint as the auth phase's verification — this environment has
no live Supabase/local-storage credentials to complete a real upload
round-trip, so this is a code-path trace, not a live click-through. If a
real environment becomes available: upload an avatar, wait past 10
minutes (or inspect the stored `avatar_url` directly), confirm the image
still loads.
