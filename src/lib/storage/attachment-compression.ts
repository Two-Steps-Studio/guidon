import { gzip } from "node:zlib";
import { promisify } from "node:util";
import path from "node:path";
import sharp from "sharp";

const zip = promisify(gzip);
const TEXT_EXTENSIONS = new Set([".txt", ".md", ".log", ".json", ".csv", ".xml", ".yaml", ".yml", ".toml"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

/**
 * Where an attachment's cover thumbnail lives: next to it, derived from its
 * path - so it sits under the same projects/<id>/ prefix migration 077
 * checks, and needs no column of its own.
 */
export function thumbnailPathFor(storagePath: string): string {
  return `${storagePath.replace(/\.[^./]+$/, "")}.thumb.webp`;
}

/**
 * A small cover image for the board card (the card shows it about 260x112
 * CSS px): 640px wide at most, WebP. null when the file isn't a still raster
 * image or can't be read - the card then falls back to the original.
 */
export async function makeCoverThumbnail(file: File): Promise<Buffer | null> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return null;
  try {
    const image = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 40_000_000, animated: false, failOn: "error" });
    const metadata = await image.metadata();
    if ((metadata.pages ?? 1) > 1) return null;
    return await image.rotate().resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true }).webp({ quality: 70 }).toBuffer();
  } catch {
    return null;
  }
}

/** New attachments only. Keep the original if conversion fails or saves less than 10%. */
export async function compressAttachment(file: File): Promise<File> {
  if (file.size < 32 * 1024) return file;
  const extension = path.extname(file.name).toLowerCase();
  if (!TEXT_EXTENSIONS.has(extension) && !IMAGE_EXTENSIONS.has(extension)) return file;
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    let converted: Buffer;
    let name: string;
    let type: string;
    if (TEXT_EXTENSIONS.has(extension)) {
      converted = await zip(bytes, { level: 6 });
      name = `${file.name}.gz`; type = "application/gzip";
    } else {
      // Bound decompressed image work and preserve animated inputs unchanged.
      const image = sharp(bytes, { limitInputPixels: 40_000_000, animated: false, failOn: "error" });
      const metadata = await image.metadata();
      if ((metadata.pages ?? 1) > 1 || !["jpeg", "png", "webp"].includes(metadata.format ?? "")) return file;
      converted = await image.rotate().resize({ width: 2560, height: 2560, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
      name = `${file.name.slice(0, -extension.length)}.webp`; type = "image/webp";
    }
    if (converted.length >= file.size * 0.9) return file;
    return new File([new Uint8Array(converted)], name, { type, lastModified: file.lastModified });
  } catch {
    return file;
  }
}
