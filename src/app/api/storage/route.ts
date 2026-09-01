import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import {
  activeStorageProviderName,
  assertSafeBucket,
  assertSafeStoragePath,
} from "@/lib/storage/provider";
import { SAFE_INLINE_EXTENSION_TO_MIME } from "@/lib/storage/storage-constants";

/**
 * Serves objects for the local storage provider (TODO.md §5).
 *
 * Only reachable when STORAGE_PROVIDER=local; Supabase issues its own signed
 * URLs and never routes through here.
 *
 * Access is granted by the HMAC signature minted in LocalStorageProvider.getUrl,
 * which covers bucket, path and expiry. That keeps STORAGE_PATH off the public
 * filesystem - nothing is statically served, so an object cannot be reached by
 * guessing a name.
 */
export async function GET(request: NextRequest) {
  if (activeStorageProviderName() !== "local") {
    return NextResponse.json(
      { error: "Local storage is not enabled" },
      { status: 404 }
    );
  }

  const { searchParams } = new URL(request.url);
  const bucket = searchParams.get("bucket");
  const objectPath = searchParams.get("path");
  const expires = Number(searchParams.get("expires"));
  const signature = searchParams.get("signature");
  const isPublic = searchParams.get("public") === "1";

  if (!bucket || !objectPath || !signature || !Number.isFinite(expires)) {
    return NextResponse.json({ error: "Malformed URL" }, { status: 400 });
  }

  let safeBucket: string;
  let safePath: string;

  try {
    safeBucket = assertSafeBucket(bucket);
    safePath = assertSafeStoragePath(objectPath);
  } catch {
    // Do not echo the rejected path back to the caller.
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const { LocalStorageProvider, verifyStorageSignature } = await import(
    "@/lib/storage/providers/local"
  );

  if (!verifyStorageSignature(safeBucket, safePath, expires, signature, isPublic)) {
    // One response for bad signature and expired link - no oracle. Note
    // `isPublic` is itself part of the signed payload (local.ts), so a
    // private file's real signed URL can't be replayed with `&public=1`
    // appended to make it serve inline - the signature just won't match.
    return NextResponse.json({ error: "Link is invalid or has expired" }, {
      status: 403,
    });
  }

  // Safe to serve inline with its real Content-Type only for a `public`
  // link whose extension is in the known-safe raster set - upload-time
  // validation (SAFE_INLINE_IMAGE_TYPES) is what actually keeps anything
  // else from ever reaching this bucket with `public: true`. Everything
  // else (every non-public object, and a public link with an unexpected
  // extension) keeps the safe default: octet-stream + nosniff + forced
  // download, so nothing can execute as a document even if opened directly.
  const extension = path.extname(safePath).slice(1).toLowerCase();
  const inlineMime = isPublic ? SAFE_INLINE_EXTENSION_TO_MIME[extension] : undefined;

  try {
    const provider = new LocalStorageProvider();
    const blob = await provider.download(safeBucket, safePath);

    return new NextResponse(blob, {
      headers: inlineMime
        ? {
            "Content-Type": inlineMime,
            "Content-Length": String(blob.size),
            // Public avatars/project images are effectively permanent
            // (PUBLIC_URL_TTL_SECONDS) and meant to be reused across
            // requests, unlike the short-lived private download links.
            "Cache-Control": "public, max-age=31536000, immutable",
          }
        : {
            "Content-Type": "application/octet-stream",
            "Content-Length": String(blob.size),
            // Signed and time-limited, so it must not be shared by a proxy.
            "Cache-Control": "private, max-age=60",
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": `attachment; filename="${path.basename(safePath)}"`,
          },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
