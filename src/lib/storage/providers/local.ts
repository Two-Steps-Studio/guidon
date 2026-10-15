import "server-only";

import { createReadStream } from "node:fs";
import { mkdir, readFile, rm, stat, readdir } from "node:fs/promises";
import path from "node:path";
import {
  assertSafeBucket,
  assertSafeStoragePath,
  type StorageProvider,
  type UploadOptions,
} from "../provider";
import { appStorageUrl } from "../signed-url";

/**
 * Local filesystem storage - the self-hosted default (TODO.md §5).
 *
 * Objects live under STORAGE_PATH/<bucket>/<path>. Files are served back
 * through /api/storage rather than statically, so access stays behind the
 * application's authorisation and nothing under STORAGE_PATH is web-reachable
 * by guessing a filename.
 */
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

  /** Signed URL to the application's own storage route - see ../signed-url.ts. */
  async getUrl(
    bucket: string,
    objectPath: string,
    options?: { expiresInSeconds?: number; public?: boolean }
  ): Promise<string> {
    return appStorageUrl(bucket, objectPath, options);
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

  /**
   * Size only, without reading the file - the storage route needs this for
   * Content-Length before it starts streaming the body with createStream()
   * below. Returns null for a missing object so the route can 404 instead
   * of throwing.
   */
  async statObject(bucket: string, objectPath: string): Promise<{ size: number } | null> {
    const full = this.resolve(bucket, objectPath);
    const info = await stat(full).catch(() => null);
    return info ? { size: info.size } : null;
  }

  /** Used by the storage route to stream a verified object. */
  createStream(bucket: string, objectPath: string) {
    return createReadStream(this.resolve(bucket, objectPath));
  }
}

// URL signing lives in ../signed-url.ts (shared with the S3 provider);
// re-exported for existing imports.
export { signStoragePath, verifyStorageSignature } from "../signed-url";

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
