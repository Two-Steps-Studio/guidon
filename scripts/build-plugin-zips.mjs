#!/usr/bin/env node
/**
 * Packs every plugin listed in plugins/catalog.json into a zip under
 * public/downloads/plugins/, so the /plugins page can offer direct downloads
 * from this app's own origin - no GitHub Releases, CDN or network access
 * needed, which self-hosted mode (docs/self-hosting.md) requires.
 *
 * Run automatically before `next dev` and `next build` (predev/prebuild npm
 * scripts); safe to re-run any time. Output is gitignored.
 *
 * Deliberately dependency-free: a minimal zip writer (deflate via node:zlib,
 * fixed timestamps so the same sources always produce the same bytes) - the
 * Docker builder stage has no `zip` binary and this doesn't justify a new
 * npm dependency.
 */

import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";
import { createHash } from "node:crypto";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const DEST = path.join(ROOT, "public", "downloads", "plugins");

/** Build output, dependencies and local state - never part of a download. */
const EXCLUDED_DIRS = new Set([
  "node_modules",
  "out",
  "build",
  "dist",
  ".gradle",
  ".intellijPlatform",
  ".kotlin",
  ".idea",
  ".vscode-test",
  "__pycache__",
  "Binaries",
  "Intermediate",
]);
const EXCLUDED_FILES = [/\.vsix$/, /\.pyc$/, /^\.DS_Store$/, /\.map$/];

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// 2026-01-01 00:00 in MS-DOS format - fixed for reproducible output.
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

async function collectFiles(dir, prefix = "") {
  const entries = (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
  const files = [];
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      files.push(...(await collectFiles(path.join(dir, entry.name), rel)));
    } else if (entry.isFile() && !EXCLUDED_FILES.some((re) => re.test(entry.name))) {
      files.push(rel);
    }
  }
  return files;
}

async function buildZip(sourceDir, rootName) {
  const files = await collectFiles(sourceDir);
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const rel of files) {
    const absolute = path.join(sourceDir, rel);
    const data = await readFile(absolute);
    const mode = (await stat(absolute)).mode;
    const deflated = deflateRawSync(data, { level: 9 });
    const useDeflate = deflated.length < data.length;
    const body = useDeflate ? deflated : data;
    const name = Buffer.from(`${rootName}/${rel}`, "utf8");
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(useDeflate ? 8 : 0, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4); // made by: Unix, so modes survive
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(useDeflate ? 8 : 0, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    // Keep the executable bit (gradlew, install scripts); everything else 0644.
    central.writeUInt32LE((((mode & 0o111 ? 0o755 : 0o644) | 0o100000) << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + body.length;
  }

  const centralSize = centrals.reduce((sum, b) => sum + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);

  return { buffer: Buffer.concat([...locals, ...centrals, end]), count: files.length };
}

async function main() {
  const catalog = JSON.parse(await readFile(path.join(ROOT, "plugins", "catalog.json"), "utf8"));
  await rm(DEST, { recursive: true, force: true });
  await mkdir(DEST, { recursive: true });

  // manifest.json: what Guidon Desktop's plugin installer reads from the
  // server it's connected to (desktop/src-tauri/src/plugins.rs) - the same
  // zips the /plugins page links, plus a SHA-256 the installer checks
  // before extracting and where each one goes (catalog.json's `install`).
  const manifest = { version: 1, plugins: [] };

  for (const plugin of catalog.plugins) {
    const downloads = [];
    for (const download of plugin.downloads) {
      const { buffer, count } = await buildZip(path.join(ROOT, download.source), download.root);
      await writeFile(path.join(DEST, download.file), buffer);
      console.log(`  ${download.file}: ${count} files, ${(buffer.length / 1024).toFixed(0)} KB`);
      downloads.push({
        id: download.id,
        kind: download.kind,
        file: download.file,
        root: download.root,
        size: buffer.length,
        sha256: createHash("sha256").update(buffer).digest("hex"),
        install: download.install ?? null,
      });
    }
    manifest.plugins.push({ id: plugin.id, name: plugin.name, requires: plugin.requires, downloads });
  }
  await writeFile(path.join(DEST, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Built plugin downloads in ${path.relative(ROOT, DEST)}`);
}

main().catch((err) => {
  // Fatal, unlike copy-monaco-assets: a build that silently ships a
  // downloads page full of 404s is worse than a failed build.
  console.error("build-plugin-zips failed:", err);
  process.exit(1);
});
