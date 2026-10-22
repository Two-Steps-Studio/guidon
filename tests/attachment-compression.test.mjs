import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import sharp from "sharp";
import { compressAttachment } from "../src/lib/storage/attachment-compression.ts";

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
