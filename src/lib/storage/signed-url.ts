import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { SITE_URL } from "@/lib/site-url";
import { assertSafeBucket, assertSafeStoragePath } from "./provider";

/**
 * Signed URLs for objects served by the application itself (/api/storage) -
 * used by the `local` provider for everything and by `s3` unless it has a
 * public base URL. The signature covers bucket, path, expiry AND the public
 * flag, so a URL cannot be edited to reach another object, extend its own
 * lifetime, or flip a private file to serve as if it were public.
 */

/** Effectively permanent - for `public: true` objects (avatars), whose URLs are stored. */
export const PUBLIC_URL_TTL_SECONDS = 50 * 365 * 24 * 60 * 60;

function signingSecret(): string {
  const secret = process.env.AUTH_SECRET ?? process.env.STORAGE_SIGNING_SECRET;

  if (!secret) {
    // Failing loudly beats signing with a default that every install shares.
    throw new Error("AUTH_SECRET (or STORAGE_SIGNING_SECRET) must be set to serve stored files");
  }

  return secret;
}

export function signStoragePath(bucket: string, objectPath: string, expires: number, isPublic = false): string {
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

/**
 * `public: true` only changes the signed lifetime: PUBLIC_URL_TTL_SECONDS
 * instead of the 10-minute default. Whether the object is served inline
 * with its real Content-Type or forced to download is decided by
 * /api/storage from the extension alone (SAFE_INLINE_EXTENSION_TO_MIME,
 * storage-constants.ts) - a private signed link is as safe to render inline
 * as a public one for that narrow, non-executable set of formats.
 */
export function appStorageUrl(
  bucket: string,
  objectPath: string,
  options?: { expiresInSeconds?: number; public?: boolean }
): string {
  assertSafeBucket(bucket);
  const safePath = assertSafeStoragePath(objectPath);

  const isPublic = Boolean(options?.public);
  const ttl = isPublic ? PUBLIC_URL_TTL_SECONDS : options?.expiresInSeconds ?? 600;
  const expires = Math.floor(Date.now() / 1000) + ttl;

  const params = new URLSearchParams({
    bucket,
    path: safePath,
    expires: String(expires),
    signature: signStoragePath(bucket, safePath, expires, isPublic),
    ...(isPublic ? { public: "1" } : {}),
  });

  // SITE_URL, not a request-derived origin: this runs server-side, often
  // outside a request (stored avatar URLs), and must be absolute.
  return `${SITE_URL}/api/storage?${params.toString()}`;
}
