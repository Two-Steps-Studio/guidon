import "server-only";
import sharp from "sharp";
import { getStorageProvider } from "./provider";
import { STORAGE_BUCKETS } from "./storage-constants";
import { thumbnailPathFor } from "./attachment-compression";

const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const MAX_CACHE_BYTES = 16 * 1024 * 1024;
const previews = new Map<string, { bytes: Buffer; expires: number }>();
let cacheBytes = 0;

/** Static card preview only. Original attachment bytes are never overwritten. */
export async function makeCoverPreview(bytes: Uint8Array): Promise<Buffer> {
  if (bytes.byteLength > MAX_SOURCE_BYTES) throw new Error("Cover source is too large");
  const image = sharp(bytes, { limitInputPixels: 40_000_000, animated: false, failOn: "error" });
  const metadata = await image.metadata();
  if (!["png", "jpeg", "webp", "gif", "avif"].includes(metadata.format ?? "")) throw new Error("Unsupported cover image");
  return image.rotate().resize(520, 224, { fit: "cover", withoutEnlargement: true }).webp({ quality: 70 }).toBuffer();
}

/** Call only after the request's task/attachment RLS checks, including cache hits. */
export async function readCoverPreview(storagePath: string): Promise<Buffer> {
  const cached = previews.get(storagePath);
  if (cached && cached.expires > Date.now()) return cached.bytes;
  if (cached) { previews.delete(storagePath); cacheBytes -= cached.bytes.length; }
  const provider = await getStorageProvider();
  let source: Blob;
  try { source = await provider.download(STORAGE_BUCKETS.ATTACHMENTS, thumbnailPathFor(storagePath)); }
  catch { source = await provider.download(STORAGE_BUCKETS.ATTACHMENTS, storagePath); }
  if (source.size > MAX_SOURCE_BYTES) throw new Error("Cover source is too large");
  const bytes = await makeCoverPreview(new Uint8Array(await source.arrayBuffer()));
  const previous = previews.get(storagePath);
  if (previous) { previews.delete(storagePath); cacheBytes -= previous.bytes.length; }
  while (previews.size && (previews.size >= 128 || cacheBytes + bytes.length > MAX_CACHE_BYTES)) {
    const key = previews.keys().next().value!;
    cacheBytes -= previews.get(key)!.bytes.length;
    previews.delete(key);
  }
  if (bytes.length <= MAX_CACHE_BYTES) {
    previews.set(storagePath, { bytes, expires: Date.now() + 5 * 60_000 });
    cacheBytes += bytes.length;
  }
  return bytes;
}
