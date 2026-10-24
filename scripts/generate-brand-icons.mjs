import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const faviconOnly = process.argv.includes("--favicon-only");
const colors = {
  white: "#FFFFFF",
};

const symbolSource = await readFile(resolve(root, "public/brand/guidon-symbol-blue.svg"), "utf8");
const blue = symbolSource.match(/<path\b[^>]*\bfill="([^"]+)"/i)?.[1];
const pathData = symbolSource.match(/<path\b[^>]*\bd="([^"]+)"/i)?.[1];
if (!blue || !pathData) throw new Error("Could not find the official Guidon symbol path and color.");

function iconSvg(size, { foreground, background = null, ratio = 0.7 }) {
  const markSize = Math.round(size * ratio);
  const inset = Math.round((size - markSize) / 2);
  const bg = background ? `<rect width="${size}" height="${size}" fill="${background}"/>` : "";
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${bg}<svg x="${inset}" y="${inset}" width="${markSize}" height="${markSize}" viewBox="140 380 255 262"><path fill="${foreground}" d="${pathData}"/></svg></svg>`,
  );
}

async function png(size, options) {
  return sharp(iconSvg(size, options)).png().toBuffer();
}

async function writePng(path, size, options) {
  await writeFile(resolve(root, path), await png(size, options));
}

function ico(frames) {
  const headerSize = 6 + frames.length * 16;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);

  let offset = headerSize;
  frames.forEach(({ size, image }, index) => {
    const entry = 6 + index * 16;
    header.writeUInt8(size === 256 ? 0 : size, entry);
    header.writeUInt8(size === 256 ? 0 : size, entry + 1);
    header.writeUInt8(0, entry + 2);
    header.writeUInt8(0, entry + 3);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(image.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += image.length;
  });

  return Buffer.concat([header, ...frames.map(({ image }) => image)]);
}

// Browser favicons are shown uncropped, so use their canvas more fully than
// the safe-area artwork used for installed apps and circular profile images.
await writePng("src/app/icon.png", 512, { foreground: blue, ratio: 0.94 });
if (!faviconOnly) await writePng("src/app/apple-icon.png", 180, {
  foreground: blue,
  background: colors.white,
  ratio: 0.7,
});

const faviconFrames = [];
for (const size of [16, 32, 48, 64, 256]) {
  faviconFrames.push({
    size,
    image: await png(size, { foreground: blue, ratio: 0.94 }),
  });
}
await writeFile(resolve(root, "src/app/favicon.ico"), ico(faviconFrames));
if (faviconOnly) {
  console.log("Generated larger, transparent browser favicons from the official Guidon symbol.");
  process.exit(0);
}

await writePng("public/icons/icon-192.png", 192, {
  foreground: blue,
  background: colors.white,
  ratio: 0.68,
});
await writePng("public/icons/icon-512.png", 512, {
  foreground: blue,
  background: colors.white,
  ratio: 0.68,
});
await writePng("public/icons/icon-maskable-512.png", 512, {
  foreground: colors.white,
  background: blue,
  ratio: 0.52,
});

await writePng("mobile/assets/icon.png", 1024, {
  foreground: colors.white,
  background: blue,
  ratio: 0.66,
});
await writePng("mobile/assets/android-icon-foreground.png", 432, {
  foreground: colors.white,
  ratio: 0.58,
});
await writePng("mobile/assets/android-icon-monochrome.png", 432, {
  foreground: colors.white,
  ratio: 0.58,
});
await writePng("mobile/assets/splash-icon.png", 1024, {
  foreground: colors.white,
  ratio: 0.5,
});
await writePng("plugins/vscode/media/icon.png", 128, { foreground: blue, ratio: 0.74 });

const unityIcon = await png(64, { foreground: blue, ratio: 0.74 });
const unityPath = resolve(root, "plugins/unity/Guidon/Editor/GuidonLogo.cs");
const unitySource = await readFile(unityPath, "utf8");
const unityPattern = /private const string IconBase64 =\s*"[^"]*";/s;
if (!unityPattern.test(unitySource)) throw new Error("Could not find the embedded Unity icon.");
const unityUpdated = unitySource.replace(
  unityPattern,
  `private const string IconBase64 =\n            "${unityIcon.toString("base64")}";`,
);
if (unityUpdated !== unitySource) await writeFile(unityPath, unityUpdated);

console.log("Generated Guidon web, PWA, mobile, VS Code, and Unity icons from the official blue symbol.");
