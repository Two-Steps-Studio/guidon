import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import sharp from "sharp";
import { compressAttachment, makeCoverThumbnail, thumbnailPathFor } from "../src/lib/storage/attachment-compression.ts";

const text = "A diagnostic log entry with repeated data\n".repeat(4000);
const original = new File([text], "game.log", { type: "text/plain" });
const compressed = await compressAttachment(original);
assert.equal(compressed.name, "game.log.gz");
assert.equal(compressed.type, "application/gzip");
assert.ok(compressed.size < original.size * 0.9);
assert.equal(gunzipSync(Buffer.from(await compressed.arrayBuffer())).toString(), text);
console.log("pass log compression round-trips all original bytes");

const png = await sharp({ create: { width: 2800, height: 1800, channels: 4, background: { r: 20, g: 90, b: 180, alpha: 0.5 } } }).png({ compressionLevel: 0 }).toBuffer();
const image = new File([png], "shot.png", { type: "image/png" });
const webp = await compressAttachment(image);
assert.equal(webp.name, "shot.webp");
assert.equal(webp.type, "image/webp");
assert.ok(webp.size < image.size * 0.9);
const metadata = await sharp(Buffer.from(await webp.arrayBuffer())).metadata();
assert.equal(metadata.width, 2560);
assert.equal(metadata.hasAlpha, true);
console.log("pass image conversion bounds dimensions and retains transparency");

for (const file of [new File(["short"], "short.txt"), new File([text], "data.zip"), new File([text], "fake.png", { type: "image/png" })]) {
  assert.equal(await compressAttachment(file), file);
}
console.log("pass small, unsupported and invalid inputs remain unchanged");

const cover = await makeCoverThumbnail(webp);
const coverMeta = await sharp(cover).metadata();
assert.equal(coverMeta.format, "webp");
assert.equal(coverMeta.width, 640);
assert.ok(cover.length < 60 * 1024, `cover is ${cover.length} bytes`);
assert.equal(await makeCoverThumbnail(new File([text], "notes.txt", { type: "text/plain" })), null);
assert.equal(await makeCoverThumbnail(new File([text], "fake.png", { type: "image/png" })), null);
console.log("pass cover thumbnail: 640px WebP under 60 KB; non-images and broken images give none");

assert.equal(thumbnailPathFor("projects/p/tasks/t/u/1.webp"), "projects/p/tasks/t/u/1.thumb.webp");
assert.equal(thumbnailPathFor("projects/p/tasks/t/u/1"), "projects/p/tasks/t/u/1.thumb.webp");
assert.equal(thumbnailPathFor("projects/p.x/tasks/t/u/1.png"), "projects/p.x/tasks/t/u/1.thumb.webp");
console.log("pass thumbnail path stays next to the original, under the same project prefix");
