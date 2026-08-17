/**
 * Storage provider abstraction (TODO.md §5, §24).
 *
 * Guidon must run self-hosted without a managed bucket, so nothing above this
 * layer may talk to Supabase Storage directly. The interface is deliberately
 * small — it is the set of operations `storage.ts` actually performs, not a
 * general-purpose object-store API.
 *
 * SERVER ONLY. `local` uses node:fs, and the Supabase implementation may use
 * the service-role key. Never import this from a client component; import
 * `storage-constants.ts` instead, which is safe on both sides.
 */

import "server-only";

export interface UploadOptions {
  contentType?: string;
  /** Overwrite an existing object at the same path. */
  upsert?: boolean;
}

export interface StorageProvider {
  readonly name: "supabase" | "local" | "s3";

  /**
   * Ensure a bucket/container exists. A no-op for providers where buckets are
   * implicit; for `local` it creates the directory.
   */
  ensureBucket(bucket: string, options?: { public?: boolean }): Promise<void>;

  upload(
    bucket: string,
    path: string,
    body: File | Blob | ArrayBuffer | Uint8Array,
    options?: UploadOptions
  ): Promise<void>;

  download(bucket: string, path: string): Promise<Blob>;

  remove(bucket: string, paths: string[]): Promise<void>;

  /**
   * A URL the browser can fetch. Providers backed by private storage return a
   * time-limited signed URL; `expiresInSeconds` is advisory for providers that
   * serve public objects.
   */
  getUrl(
    bucket: string,
    path: string,
    expiresInSeconds?: number
  ): Promise<string>;

  /** Bytes stored under a prefix, used for quota accounting. */
  usage?(bucket: string, prefix: string): Promise<number>;
}

// ============================================
// PATH SAFETY
// ============================================

/**
 * Reject anything that could escape the bucket root.
 *
 * On Supabase this is enforced server-side, but the local provider maps paths
 * onto a real filesystem, where `../` is a directory-traversal write primitive.
 * Validation lives here rather than in the local provider so that every
 * provider is held to the same contract.
 */
export function assertSafeStoragePath(path: string): string {
  const value = path.trim();

  if (!value) {
    throw new Error("Storage path must not be empty");
  }

  if (value.length > 1024) {
    throw new Error("Storage path is too long");
  }

  // Backslashes are separators on Windows; normalise before checking.
  const normalised = value.replace(/\\/g, "/");

  if (normalised.startsWith("/")) {
    throw new Error("Storage path must be relative");
  }

  if (/^[a-zA-Z]:/.test(normalised)) {
    throw new Error("Storage path must not be absolute");
  }

  if (normalised.split("/").some((segment) => segment === "..")) {
    throw new Error("Storage path must not traverse directories");
  }

  // NUL and control characters are never legitimate here.
  if (/[\x00-\x1f\x7f]/.test(normalised)) {
    throw new Error("Storage path contains invalid characters");
  }

  return normalised;
}

export function assertSafeBucket(bucket: string): string {
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(bucket)) {
    throw new Error(`Invalid bucket name: ${bucket}`);
  }
  return bucket;
}

// ============================================
// FACTORY
// ============================================

export type StorageProviderName = StorageProvider["name"];

function resolveProviderName(): StorageProviderName {
  const configured = (process.env.STORAGE_PROVIDER ?? "supabase")
    .trim()
    .toLowerCase();

  if (configured === "supabase" || configured === "local" || configured === "s3") {
    return configured;
  }

  throw new Error(
    `Unknown STORAGE_PROVIDER "${configured}". Expected one of: supabase, local, s3.`
  );
}

let cached: StorageProvider | null = null;

/**
 * Resolve the configured provider. Cached per process — the provider holds no
 * request state, so a single instance is correct and avoids re-reading env on
 * every call.
 */
export async function getStorageProvider(): Promise<StorageProvider> {
  if (cached) return cached;

  const name = resolveProviderName();

  switch (name) {
    case "local": {
      const { LocalStorageProvider } = await import("./providers/local");
      cached = new LocalStorageProvider();
      break;
    }

    case "s3":
      // Deliberately not implemented rather than stubbed: a provider that
      // silently drops uploads is worse than a clear failure. The interface
      // above is what an S3 implementation needs to satisfy.
      throw new Error(
        "STORAGE_PROVIDER=s3 is not implemented yet. Use 'supabase' or 'local'."
      );

    case "supabase":
    default: {
      const { SupabaseStorageProvider } = await import("./providers/supabase");
      cached = new SupabaseStorageProvider();
      break;
    }
  }

  return cached;
}

/** Testing seam; also used by the health check to report the active provider. */
export function activeStorageProviderName(): StorageProviderName {
  return resolveProviderName();
}
