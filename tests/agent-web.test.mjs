#!/usr/bin/env node
/**
 * Agent-facing web behaviour (src/lib/agent-web.ts): Accept negotiation,
 * which paths are real signed-in sections (everything else 404s), and the
 * Markdown bodies.
 *
 *   npm run test:agent-web
 *
 * agent-web.ts has no imports on purpose, so Node's built-in TypeScript type
 * stripping can load it directly.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  LANDING_FEATURE_KEYS,
  SIGNED_IN_SECTIONS,
  homepageMarkdown,
  isSignedInSection,
  notFoundMarkdown,
  prefersMarkdown,
} from "../src/lib/agent-web.ts";

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

const root = new URL("..", import.meta.url).pathname;

console.log("\n  prefersMarkdown");
check("text/markdown alone", prefersMarkdown("text/markdown"));
check("markdown before html", prefersMarkdown("text/markdown, text/html;q=0.9"));
check("equal q picks markdown", prefersMarkdown("text/html, text/markdown"));
check("markdown with charset param", prefersMarkdown("text/markdown; charset=utf-8"));
check("case-insensitive", prefersMarkdown("Text/Markdown"));
check("browser Accept -> html", !prefersMarkdown("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"));
check("wildcard only -> html", !prefersMarkdown("*/*"));
check("html ranked higher -> html", !prefersMarkdown("text/html, text/markdown;q=0.5"));
check("markdown q=0 -> html", !prefersMarkdown("text/markdown;q=0"));
check("missing header -> html", !prefersMarkdown(null) && !prefersMarkdown(""));

console.log("\n  isSignedInSection");
for (const path of ["/dashboard", "/projects/abc/work", "/organizations/x", "/profile", "/api/ai/chat", "/admin", "/plugins", "/mini", "/discord/link"]) {
  check(`${path} is signed-in`, isSignedInSection(path));
}
for (const path of ["/", "/some-path-that-does-not-exist", "/wp-admin", "/projectsx", "/docs", "/about"]) {
  check(`${path} is not`, !isSignedInSection(path));
}

// Every top-level folder under src/app that serves a page or route must be
// either a signed-in section or public in src/proxy.ts - otherwise anonymous
// visitors would get a 404 for a page that exists instead of the login page.
console.log("\n  every src/app section is classified");
const PUBLIC_SECTIONS = new Set(["auth", "legal", "index.md"]);
function servesRoutes(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (servesRoutes(full)) return true;
    } else if (/^(page|route)\.(tsx?|jsx?)$/.test(entry)) {
      return true;
    }
  }
  return false;
}
const appDir = join(root, "src/app");
for (const entry of readdirSync(appDir)) {
  const full = join(appDir, entry);
  if (!statSync(full).isDirectory() || !servesRoutes(full)) continue;
  const segment = entry.replace(/^\((.*)\)$/, "$1");
  check(`${entry}/ is signed-in or public`, SIGNED_IN_SECTIONS.has(segment) || PUBLIC_SECTIONS.has(segment));
}
const proxySource = readFileSync(join(root, "src/proxy.ts"), "utf8");
check("proxy.ts lists /auth/ and /legal/ as public", proxySource.includes("'/auth/'") && proxySource.includes("'/legal/'"));
check("proxy.ts lists /index.md and /llms.txt as public", proxySource.includes("'/index.md'") && proxySource.includes("'/llms.txt'"));

console.log("\n  notFoundMarkdown");
const notFound = notFoundMarkdown("/nope", "https://useguidon.com");
check("starts with a 404 heading", notFound.startsWith("# 404"));
check("names the path", notFound.includes("`/nope`"));
check("points to llms.txt and sitemap", notFound.includes("https://useguidon.com/llms.txt") && notFound.includes("https://useguidon.com/sitemap.xml"));
check("backtick in path can't break the code span", notFoundMarkdown("/a`b", "https://x").includes("`/a%60b`"));

console.log("\n  homepageMarkdown");
const en = JSON.parse(readFileSync(join(root, "messages/en.json"), "utf8"));
const home = homepageMarkdown(en.landing, "https://useguidon.com");
check("single H1 with the hero title", home.startsWith(`# Guidon - ${en.landing.heroTitle}\n`) && home.split("\n").filter((l) => l.startsWith("# ")).length === 1);
check("every feature from messages/en.json", LANDING_FEATURE_KEYS.every((key) => home.includes(`### ${en.landing.features[key].title}`)));
check("feature keys match the landing copy", Object.keys(en.landing.features).every((key) => LANDING_FEATURE_KEYS.includes(key)));
check("headings never skip a level", (() => {
  let previous = 0;
  for (const line of home.split("\n")) {
    const level = /^(#+) /.exec(line)?.[1].length;
    if (!level) continue;
    if (level > previous + 1) return false;
    previous = level;
  }
  return true;
})());
check("over 500 characters", home.length > 500, home.length);
check("links to signup and llms.txt", home.includes("https://useguidon.com/auth/signup") && home.includes("https://useguidon.com/llms.txt"));

console.log("\n  public/llms.txt");
const llms = readFileSync(join(root, "public/llms.txt"), "utf8");
check("starts with an H1 (llmstxt.org)", llms.startsWith("# Guidon\n"));
check("has a blockquote summary", /\n> \S/.test(llms));
check("has a when-to-use section", llms.includes("## When to use Guidon"));
const mcpRoute = readFileSync(join(root, "src/app/api/mcp/route.ts"), "utf8");
const mcpTools = readdirSync(join(root, "src/lib/mcp"), { recursive: true })
  .filter((f) => String(f).endsWith(".ts"))
  .map((f) => readFileSync(join(root, "src/lib/mcp", String(f)), "utf8"))
  .join("\n") + mcpRoute;
const listed = [...llms.matchAll(/`([a-z_]+)`/g)].map((m) => m[1]).filter((name) => /^(list|get|create|update|delete|start|set|complete|comment|record)_/.test(name));
check("every MCP tool named in llms.txt exists", listed.length > 0 && listed.every((name) => mcpTools.includes(`"${name}"`)), listed.filter((name) => !mcpTools.includes(`"${name}"`)).join(", "));

console.log(`\n  ${pass} pass / ${fail} fail\n`);
process.exit(fail ? 1 : 0);
