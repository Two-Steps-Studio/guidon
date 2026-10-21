/**
 * Every message a Server Action passes through tr() (src/lib/i18n/server-errors.ts)
 * has a translation in every non-English catalog in src/i18n/server-errors/,
 * and every catalog entry is still used - so a new or reworded error can't
 * silently show up in English for Polish, German or Spanish users.
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
let fail = 0;
function check(label, ok, detail = "") {
  if (ok) {
    pass++;
    console.log(`    pass  ${label}`);
  } else {
    fail++;
    console.log(`    FAIL  ${label}${detail ? `  -> ${detail}` : ""}`);
  }
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name)) yield full;
  }
}

const used = new Set();
for await (const file of walk(path.join(ROOT, "src"))) {
  const source = await readFile(file, "utf8");
  for (const match of source.matchAll(/\btr\("((?:[^"\\]|\\.)*)"\)/g)) used.add(JSON.parse(`"${match[1]}"`));
}
console.log(`\n  ${used.size} translated server messages`);
check("tr() is used", used.size > 100, used.size);

const dir = path.join(ROOT, "src", "i18n", "server-errors");
for (const file of (await readdir(dir)).filter((name) => name.endsWith(".json"))) {
  const catalog = JSON.parse(await readFile(path.join(dir, file), "utf8"));
  const missing = [...used].filter((message) => !(message in catalog));
  const stale = Object.keys(catalog).filter((message) => !used.has(message));
  const empty = Object.entries(catalog).filter(([, value]) => typeof value !== "string" || !value.trim());
  check(`${file}: every message translated`, missing.length === 0, missing.slice(0, 5).join(" | "));
  check(`${file}: no stale entries`, stale.length === 0, stale.slice(0, 5).join(" | "));
  check(`${file}: no empty translations`, empty.length === 0, empty.map(([k]) => k).slice(0, 5).join(" | "));
}

console.log(`\n  ${pass} pass / ${fail} fail\n`);
process.exit(fail ? 1 : 0);
