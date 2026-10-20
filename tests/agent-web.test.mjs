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
  MARKDOWN_TWINS,
  SIGNED_IN_SECTIONS,
  homepageMarkdown,
  isAiAgentUserAgent,
  isSignedInSection,
  notFoundMarkdown,
  prefersMarkdown,
  pricingMarkdown,
  withFrontmatter,
} from "../src/lib/agent-web.ts";
import { developersLlmsTxt, developersMarkdown } from "../src/lib/developers-doc.ts";
import { GITHUB_REPO_URL, SELF_HOSTING_DOCS_URL } from "../src/lib/project-links.ts";

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
const PUBLIC_SECTIONS = new Set(["auth", "legal", "index.md", "developers", "developers.md", "openapi.json", "pricing.md", ".well-known"]);
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

console.log("\n  withFrontmatter");
const fm = withFrontmatter("# Title\n", { title: 'A "quoted" title', canonical: "https://x/a" });
check("opens with a --- block", fm.startsWith("---\ntitle: "));
check("values are quoted safely", fm.includes('title: "A \\"quoted\\" title"'));
check("markdown follows the block, starting with a heading", fm.split("---\n").at(-1).startsWith("# Title"));

console.log("\n  isAiAgentUserAgent");
check("ClaudeBot", isAiAgentUserAgent("Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)"));
check("GPTBot", isAiAgentUserAgent("Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)"));
check("ChatGPT-User", isAiAgentUserAgent("Mozilla/5.0 (compatible; ChatGPT-User/1.0; +https://openai.com/bot)"));
check("not Googlebot (indexes the HTML)", !isAiAgentUserAgent("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"));
check("not a browser", !isAiAgentUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36"));
check("not empty", !isAiAgentUserAgent(null));

console.log("\n  MARKDOWN_TWINS");
for (const [page, twin] of Object.entries(MARKDOWN_TWINS)) {
  const routeDir = join(root, "src/app", twin.slice(1));
  check(`${page} -> ${twin} has a route`, statSync(routeDir).isDirectory() && readdirSync(routeDir).includes("route.ts"));
  check(`${twin} is public in proxy.ts`, proxySource.includes(`'${twin}'`));
}

console.log("\n  pricingMarkdown");
const pricing = pricingMarkdown(
  [
    { name: "Free", price_cents: 0, project_limit: 3, task_limit_per_project: 100, member_limit: 3, storage_limit_bytes: 100 * 1024 * 1024, has_ai_features: false, has_github_integration: false, has_advanced_analytics: false, has_team_roles: false, has_audit_logs: false, has_priority_support: false },
    { name: "Pro", price_cents: 1200, price_pln_cents: 4900, project_limit: null, task_limit_per_project: null, storage_limit_bytes: 10 * 1024 ** 3, has_ai_features: true, has_github_integration: true, has_advanced_analytics: false, has_team_roles: true, has_audit_logs: false, has_priority_support: false },
    { name: "Enterprise", price_cents: null, project_limit: null, task_limit_per_project: null, storage_limit_bytes: null, has_ai_features: true, has_github_integration: true, has_advanced_analytics: true, has_team_roles: true, has_audit_logs: true, has_priority_support: true },
  ],
  "https://useguidon.com"
);
check("H1 then one H2 per plan", pricing.startsWith("# Guidon pricing") && pricing.split("\n").filter((l) => l.startsWith("## ")).length === 3);
check("free / priced / custom", pricing.includes("Price: Free") && pricing.includes("€12.00 per month (49.00 zł)") && pricing.includes("Custom pricing"));
check("limits and features", pricing.includes("- 3 projects") && pricing.includes("- Unlimited projects") && pricing.includes("- 10 GB storage") && pricing.includes("- Audit logs"));
check("no plans still reads", pricingMarkdown([], "https://x").includes("not available"));

console.log("\n  developers docs");
const dev = developersMarkdown("https://useguidon.com");
const devProse = dev.replace(/```[\s\S]*?```/g, "");
check("single H1 (outside code blocks)", dev.startsWith("# ") && devProse.split("\n").filter((l) => l.startsWith("# ")).length === 1);
check("links OpenAPI, api-catalog, MCP endpoint", dev.includes("https://useguidon.com/openapi.json") && dev.includes("/.well-known/api-catalog") && dev.includes("https://useguidon.com/api/mcp"));
const devTools = [...dev.matchAll(/`([a-z_]+)`/g)].map((m) => m[1]).filter((name) => /^(list|get|create|update|delete|start|set|complete|comment|record)_/.test(name));
check("every MCP tool named in the guide exists", devTools.length > 0 && devTools.every((name) => mcpTools.includes(`"${name}"`)));
const devLlms = developersLlmsTxt("https://useguidon.com");
check("section llms.txt: H1 + summary", devLlms.startsWith("# ") && /\n> \S/.test(devLlms));
check("root llms.txt links the section llms.txt", llms.includes("/developers/llms.txt"));
check(
  "developer guide links GitHub + self-hosting (same URLs as lib/project-links.ts)",
  dev.includes(`(${GITHUB_REPO_URL})`) && dev.includes(`(${SELF_HOSTING_DOCS_URL})`)
);
check("root llms.txt links the GitHub repository", llms.includes(GITHUB_REPO_URL));

console.log(`\n  ${pass} pass / ${fail} fail\n`);
process.exit(fail ? 1 : 0);
