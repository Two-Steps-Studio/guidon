import { gzip } from "node:zlib";
import { promisify } from "node:util";
import path from "node:path";
import sharp from "sharp";

const zip = promisify(gzip);
const TEXT_EXTENSIONS = new Set([".txt", ".md", ".log", ".json", ".csv", ".xml", ".yaml", ".yml", ".toml"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

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
