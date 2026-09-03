import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rm, stat, readdir } from "node:fs/promises";
import path from "node:path";
import {
  assertSafeBucket,
  assertSafeStoragePath,
  type StorageProvider,
  type UploadOptions,
} from "../provider";
import { SITE_URL } from "@/lib/site-url";

/**
 * Local filesystem storage - the self-hosted default (TODO.md §5).
 *
 * Objects live under STORAGE_PATH/<bucket>/<path>. Files are served back
 * through /api/storage rather than statically, so access stays behind the
 * application's authorisation and nothing under STORAGE_PATH is web-reachable
 * by guessing a filename.
 */
/** Effectively permanent - see getUrl()'s `public` option. */
const PUBLIC_URL_TTL_SECONDS = 50 * 365 * 24 * 60 * 60;

export class LocalStorageProvider implements StorageProvider {
  readonly name = "local" as const;

  private readonly root: string;

  constructor(root = process.env.STORAGE_PATH ?? "./storage") {
    // Resolved once so every later path can be checked against it.
    this.root = path.resolve(root);
  }

  /**
   * Map bucket + object path to an absolute path, then verify the result is
   * still inside the root. `assertSafeStoragePath` already rejects `..`, but
   * this second check is what actually guarantees containment - symlinks and
   * unicode normalisation can defeat string-level checks alone.
   */
  private resolve(bucket: string, objectPath: string): string {
    assertSafeBucket(bucket);
    const safePath = assertSafeStoragePath(objectPath);

    const bucketRoot = path.join(this.root, bucket);
    const full = path.resolve(bucketRoot, safePath);

    const prefix = bucketRoot + path.sep;
    if (full !== bucketRoot && !full.startsWith(prefix)) {
      throw new Error("Resolved storage path escapes the bucket root");
    }

    return full;
  }

  async ensureBucket(bucket: string): Promise<void> {
    assertSafeBucket(bucket);
    await mkdir(path.join(this.root, bucket), { recursive: true });
  }

  async upload(
    bucket: string,
    objectPath: string,
    body: File | Blob | ArrayBuffer | Uint8Array,
    options?: UploadOptions
  ): Promise<void> {
    const full = this.resolve(bucket, objectPath);

    if (!options?.upsert) {
      const exists = await stat(full).then(
        () => true,
        () => false
      );
      if (exists) {
        throw new Error(`Object already exists: ${objectPath}`);
      }
    }

    await mkdir(path.dirname(full), { recursive: true });

    const bytes = await toBuffer(body);
    const { writeFile } = await import("node:fs/promises");
    await writeFile(full, bytes);
  }

  async download(bucket: string, objectPath: string): Promise<Blob> {
    const full = this.resolve(bucket, objectPath);
    const bytes = await readFile(full);
    return new Blob([new Uint8Array(bytes)]);
  }

  async remove(bucket: string, paths: string[]): Promise<void> {
    for (const objectPath of paths) {
      const full = this.resolve(bucket, objectPath);
      // force: missing objects are not an error, matching Supabase's behaviour.
      await rm(full, { force: true });
    }
  }

  /**
   * Signed URL pointing at the application's own storage route. The signature
   * covers bucket, path, expiry AND the public flag, so a URL cannot be
   * edited to reach another object, extend its own lifetime, or flip a
   * private file to serve as if it were public.
   *
   * `public: true` does two things, both handled by /api/storage: signs for
   * PUBLIC_URL_TTL_SECONDS (50 years) instead of the normal 10-minute
   * default, and marks the object servable inline (real Content-Type, no
   * forced download) instead of the safe-by-default octet-stream/attachment
   * every other object gets. Safe to do only because avatar/project/org
   * image uploads are now restricted to SAFE_INLINE_IMAGE_TYPES
   * (storage-constants.ts) at the point they're written - none of those
   * raster formats can carry an executable payload the way SVG can.
   */
  async getUrl(
    bucket: string,
    objectPath: string,
    options?: { expiresInSeconds?: number; public?: boolean }
  ): Promise<string> {
    assertSafeBucket(bucket);
    const safePath = assertSafeStoragePath(objectPath);

    const isPublic = Boolean(options?.public);
    const ttl = isPublic ? PUBLIC_URL_TTL_SECONDS : options?.expiresInSeconds ?? 600;
    const expires = Math.floor(Date.now() / 1000) + ttl;
    const signature = signStoragePath(bucket, safePath, expires, isPublic);

    const params = new URLSearchParams({
      bucket,
      path: safePath,
      expires: String(expires),
      signature,
      ...(isPublic ? { public: "1" } : {}),
    });

    // SITE_URL (lib/site-url.ts), not a direct NEXT_PUBLIC_APP_URL read - this
    // method runs server-side only (this whole provider does real filesystem
    // I/O), so it doesn't need the client-exposed var, and reading it
    // directly here was a second, unnormalized "site origin" source that the
    // APP_URL fix didn't cover: a bare-domain NEXT_PUBLIC_APP_URL wouldn't
    // crash (this is plain string concatenation, not new URL()), but would
    // silently produce a broken signed URL like "useguidon.com/api/storage?..."
    // that browsers resolve as a relative path against the current page
    // instead of the intended origin.
    return `${SITE_URL}/api/storage?${params.toString()}`;
  }

  async usage(bucket: string, prefix: string): Promise<number> {
    const start = this.resolve(bucket, prefix);

    const walk = async (dir: string): Promise<number> => {
      const entries = await readdir(dir, { withFileTypes: true }).catch(
        () => []
      );

      let total = 0;
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          total += await walk(full);
        } else {
          const info = await stat(full).catch(() => null);
          total += info?.size ?? 0;
        }
      }
      return total;
    };

    const info = await stat(start).catch(() => null);
    if (!info) return 0;
    return info.isDirectory() ? walk(start) : info.size;
  }

  /** Used by the storage route to stream a verified object. */
  createStream(bucket: string, objectPath: string) {
    return createReadStream(this.resolve(bucket, objectPath));
  }
}

// ============================================
// URL SIGNING
// ============================================

function signingSecret(): string {
  const secret = process.env.AUTH_SECRET ?? process.env.STORAGE_SIGNING_SECRET;

  if (!secret) {
    // Failing loudly beats signing with a default that every install shares.
    throw new Error(
      "AUTH_SECRET (or STORAGE_SIGNING_SECRET) must be set to serve local storage"
    );
  }

  return secret;
}

export function signStoragePath(
  bucket: string,
  objectPath: string,
  expires: number,
  isPublic = false
): string {
  return createHmac("sha256", signingSecret())
    .update(`${bucket}:${objectPath}:${expires}:${isPublic ? "public" : "private"}`)
    .digest("hex");
}

export function verifyStorageSignature(
  bucket: string,
  objectPath: string,
  expires: number,
  signature: string,
  isPublic = false
): boolean {
  if (!Number.isFinite(expires) || expires < Math.floor(Date.now() / 1000)) {
    return false;
  }

  const expected = signStoragePath(bucket, objectPath, expires, isPublic);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(signature, "hex");

  // timingSafeEqual throws on length mismatch, so guard first.
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

// ============================================
// HELPERS
// ============================================

async function toBuffer(
  body: File | Blob | ArrayBuffer | Uint8Array
): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  return new Uint8Array(await body.arrayBuffer());
}
