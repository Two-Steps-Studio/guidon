#!/usr/bin/env node
/**
 * Captures the landing page's feature screenshots (public/landing/*.webp)
 * from a running Guidon instance, in light and dark mode.
 *
 *   1. node scripts/landing/seed-demo.mjs      (prints DEMO_PROJECT_ID / DEMO_TASK_ID)
 *   2. npm run build && npm run start
 *   3. BASE_URL=http://localhost:2137 DEMO_USER_EMAIL=... DEMO_USER_PASSWORD=... \
 *      DEMO_PROJECT_ID=... DEMO_TASK_ID=... node scripts/landing/capture.mjs
 *
 * Re-run whenever a captured page's look changes noticeably - unlike the
 * live board preview at the top of the landing page, these are real
 * screenshots and don't follow UI changes on their own.
 *
 * Needs Playwright (not a project dependency - `npx playwright` or a global
 * install; set PLAYWRIGHT_MODULE / CHROMIUM_PATH if it isn't found) and uses
 * sharp (installed with Next) to write WebP.
 */

import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "..", "..", "public", "landing");

const env = process.env;
for (const key of ["DEMO_USER_EMAIL", "DEMO_USER_PASSWORD", "DEMO_PROJECT_ID", "DEMO_TASK_ID"]) {
  if (!env[key]) {
    console.error(`Missing ${key} - see the comment at the top of this file.`);
    process.exit(1);
  }
}
const BASE = env.BASE_URL ?? "http://localhost:2137";
const P = `${BASE}/projects/${env.DEMO_PROJECT_ID}`;

const { chromium } = await import(env.PLAYWRIGHT_MODULE ?? "playwright");
const sharp = (await import("sharp")).default;

/** Feature key (matches FEATURE_SECTIONS in src/app/page.tsx) -> what to capture. */
const SHOTS = [
  { key: "taskBoard", url: `${P}/work?openTask=${env.DEMO_TASK_ID}`, target: '[role="dialog"]', preview: true },
  { key: "aiTaskApi", url: `${BASE}/plugins`, target: "main" },
  { key: "decisions", url: `${P}/decisions`, target: "main" },
  { key: "knowledgeBase", url: `${P}/knowledge`, target: "main" },
  { key: "memoryContext", url: `${P}/memory`, target: "main" },
  { key: "roadmap", url: `${P}/roadmap`, target: "main" },
];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch(env.CHROMIUM_PATH ? { executablePath: env.CHROMIUM_PATH } : {});

for (const theme of ["light", "dark"]) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 820 },
    deviceScaleFactor: 2,
    colorScheme: theme,
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/auth/login`, { waitUntil: "networkidle" });
  await page.fill("#email", env.DEMO_USER_EMAIL);
  await page.fill("#password", env.DEMO_USER_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard");
  await context.addCookies([{ name: "theme", value: theme, url: BASE }]);

  for (const shot of SHOTS) {
    await page.goto(shot.url, { waitUntil: "networkidle" });
    // The page content only - the innermost <main> is the sidebar inset
    // (the app shell has an outer <main> around the sidebar too, which
    // would put the demo account's name/email in the picture).
    const target = page.locator(shot.target).last();
    await target.waitFor();
    // Floating AI chat button and focus rings are noise in a still image.
    await page.addStyleTag({ content: ".fixed.bottom-6.right-6 { display: none !important; }" });
    if (shot.preview) await page.getByRole("button", { name: "Preview" }).click();
    await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
    await page.waitForTimeout(600); // fonts, images, entry transitions
    const box = await target.boundingBox();
    // Top of the page only, at a fixed aspect ratio - consistent tiles on the landing page.
    const clip = { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, box.width * 0.625) };
    const png = await page.screenshot({ clip });
    const file = path.join(OUT, `${shot.key}-${theme}.webp`);
    await sharp(png).resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 82 }).toFile(file);
    console.log(`  ${path.relative(process.cwd(), file)}`);
  }
  await context.close();
}

await browser.close();
