import path from "node:path";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import {
  activeStorageProviderName,
  assertSafeBucket,
  assertSafeStoragePath,
} from "@/lib/storage/provider";
import { SAFE_INLINE_EXTENSION_TO_MIME } from "@/lib/storage/storage-constants";

/**
 * Serves objects for the local and S3 storage providers (TODO.md §5).
 *
 * Not used with STORAGE_PROVIDER=supabase, which issues its own signed URLs.
 *
 * Access is granted by the HMAC signature minted in appStorageUrl
 * (lib/storage/signed-url.ts), which covers bucket, path and expiry. That
 * keeps STORAGE_PATH off the public filesystem and lets an S3 bucket stay
 * private - nothing is statically served, so an object cannot be reached by
 * guessing a name.
 */
export async function GET(request: NextRequest) {
  const providerName = activeStorageProviderName();
  if (providerName !== "local" && providerName !== "s3") {
    return NextResponse.json(
      { error: "Stored files are not served by this route" },
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

  const { verifyStorageSignature } = await import("@/lib/storage/signed-url");

  if (!verifyStorageSignature(safeBucket, safePath, expires, signature, isPublic)) {
    // One response for bad signature and expired link - no oracle. Note
    // `isPublic` is itself part of the signed payload (local.ts), so a
    // private file's real signed URL can't be replayed with `&public=1`
    // appended to make it serve inline - the signature just won't match.
    return NextResponse.json({ error: "Link is invalid or has expired" }, {
      status: 403,
    });
  }

  // Safe to serve inline with its real Content-Type whenever the extension
  // is in the known-safe set (SAFE_INLINE_EXTENSION_TO_MIME), whether this
  // is a public avatar/project-image link or a private, signed
  // knowledge-base file link - see that constant's own comment for why
  // that's independent of `isPublic`. Everything else keeps the safe
  // default: octet-stream + nosniff + forced download, so nothing can
  // execute as a document even if opened directly.
  const extension = path.extname(safePath).slice(1).toLowerCase();
  const inlineMime = SAFE_INLINE_EXTENSION_TO_MIME[extension];

  try {
    // Streamed rather than provider.download() (reads the whole file into
    // one in-process Buffer before responding) - every preview/download
    // request used to hold an entire file in memory at once, up to this
    // app's per-file upload limit (25MB, FILE_SIZE_LIMITS.DOCUMENT), for a
    // route that can see real concurrent traffic on a self-hosted install.
    // statObject() first, rather than letting the stream's not-found error
    // surface only after headers would already be sent.
    let info: { size: number } | null;
    let body: ReadableStream;
    if (providerName === "s3") {
      const { getStorageProvider } = await import("@/lib/storage/provider");
      const provider = (await getStorageProvider()) as import("@/lib/storage/providers/s3").S3StorageProvider;
      info = await provider.statObject(safeBucket, safePath);
      if (!info) return NextResponse.json({ error: "Not found" }, { status: 404 });
      body = await provider.createWebStream(safeBucket, safePath);
    } else {
      const { LocalStorageProvider } = await import("@/lib/storage/providers/local");
      const provider = new LocalStorageProvider();
      info = await provider.statObject(safeBucket, safePath);
      if (!info) return NextResponse.json({ error: "Not found" }, { status: 404 });
      body = Readable.toWeb(provider.createStream(safeBucket, safePath)) as ReadableStream;
    }

    return new NextResponse(body, {
      headers: inlineMime
        ? {
            "Content-Type": inlineMime,
            "Content-Length": String(info.size),
            // Public avatars/project images are effectively permanent
            // (PUBLIC_URL_TTL_SECONDS) and meant to be reused across
            // requests; a private preview link is signed and time-limited,
            // so it must not be shared by a proxy the same way.
            "Cache-Control": isPublic ? "public, max-age=31536000, immutable" : "private, max-age=60",
            // Still set even though the type is trusted: without it, a
            // top-level navigation to a maliciously-renamed upload (upload
            // validation is extension-based, not a content sniff) could get
            // MIME-sniffed into something other than the declared type.
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": `inline; filename="${path.basename(safePath)}"`,
          }
        : {
            "Content-Type": "application/octet-stream",
            "Content-Length": String(info.size),
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
