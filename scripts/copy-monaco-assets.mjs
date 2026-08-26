#!/usr/bin/env node
/**
 * Copies monaco-editor's prebuilt AMD bundle into public/monaco-editor/vs so
 * the browser loads it from this app's own origin instead of a CDN — Guidon's
 * self-hosted mode (docs/self-hosting.md) must work fully offline, and a
 * jsdelivr/unpkg dependency at runtime would break that.
 *
 * Run automatically via the "postinstall" npm script; safe to re-run any time
 * (it just overwrites the destination).
 */

import { cp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");

const SRC = path.join(ROOT, "node_modules", "monaco-editor", "min", "vs");
const DEST = path.join(ROOT, "public", "monaco-editor", "vs");

async function main() {
  await rm(DEST, { recursive: true, force: true });
  await cp(SRC, DEST, { recursive: true });
  console.log(`Copied monaco-editor assets to ${path.relative(ROOT, DEST)}`);
}

main().catch((err) => {
  // Non-fatal: this only breaks the in-app code editor, not the rest of the
  // app, and should not fail `npm install` for everyone else.
  console.warn(`copy-monaco-assets: skipped (${err.message})`);
});
