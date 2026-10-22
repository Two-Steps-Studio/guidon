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
import { fileURLToPath } from "node:url";
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
import { GITHUB_REPO_URL, SELF_HOSTING_DOCS_URL, SUPPORT_EMAIL } from "../src/lib/project-links.ts";
import { aboutMarkdown, contactMarkdown, signInMarkdown, signUpMarkdown } from "../src/lib/company-pages.ts";
import { homepageJsonLd, companyPageJsonLd } from "../src/lib/structured-data.ts";
import { DOCS_RESULTS_HTML } from "../src/lib/mcp/docs-results-app.ts";
import { SKILL_NAME, a2aAgentCard, agentSkillsIndex, ardCatalog, mcpManifest, mcpServerCard, skillMarkdown } from "../src/lib/agent-discovery.ts";
import { handleA2a } from "../src/lib/a2a-core.ts";
import { searchSections, splitSections, tokens } from "../src/lib/docs-search-core.ts";
import { PROJECT_RESOURCES } from "../src/lib/api/project-resources.ts";

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

const root = fileURLToPath(new URL("..", import.meta.url));

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
const PUBLIC_SECTIONS = new Set([
  "auth",
  "legal",
  "index.md",
  "developers",
  "developers.md",
  "openapi.json",
  "pricing.md",
  ".well-known",
  "start",
  "about",
  "about.md",
  "contact",
  "contact.md",
  "sandbox",
  "sandbox.md",
  "mcp.json",
  "auth.md",
  "ask",
  "robots.txt",
  "schemamap.xml",
  "feeds",
]);
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
check("starts with an H1 (llmstxt.org)", llms.replace(/\r\n/g, "\n").startsWith("# Guidon\n"));
check("has a blockquote summary", /\n> \S/.test(llms));
check("has a when-to-use section", llms.includes("## When to use Guidon"));
const mcpRoute = readFileSync(join(root, "src/app/api/mcp/route.ts"), "utf8");
const mcpTools = readdirSync(join(root, "src/lib/mcp"), { recursive: true })
  .filter((f) => String(f).endsWith(".ts"))
  .map((f) => readFileSync(join(root, "src/lib/mcp", String(f)), "utf8"))
  .join("\n") + mcpRoute +
  // resource-tools.ts builds these names from lib/api/project-resources.ts.
  PROJECT_RESOURCES.flatMap((r) => [`list_${r.plural}`, ...["get", "create", "update", "delete"].map((verb) => `${verb}_${r.noun}`)])
    .map((name) => `"${name}"`)
    .join("\n");
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
  check(
    `${twin} is public in proxy.ts`,
    proxySource.includes(`'${twin}'`) || ["/auth/", "/legal/"].some((prefix) => twin.startsWith(prefix))
  );
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


console.log("\n  about / contact (trust pages) and JSON-LD");
{
  const site = "https://useguidon.com";
  const strip = (md) => md.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[#*`]/g, "");
  for (const [name, md] of [["about", aboutMarkdown(site)], ["contact", contactMarkdown(site)]]) {
    check(`/${name} has at least 500 characters of text`, strip(md).length >= 500, strip(md).length);
    check(`/${name} starts with a top-level heading`, md.startsWith("# "));
  }
  check("contact page gives the support email (same as lib/project-links.ts)", contactMarkdown(site).includes(`mailto:${SUPPORT_EMAIL}`));
  check("company pages link GitHub (same URL as lib/project-links.ts)", aboutMarkdown(site).includes(GITHUB_REPO_URL));
  check("sign-in twin points agents at API keys", signInMarkdown(site).startsWith("# ") && signInMarkdown(site).includes("Authorization: Bearer"));
  check("sign-up twin links the terms", signUpMarkdown(site).includes("/legal/terms"));

  const home = homepageJsonLd(site, [
    { name: "Free", price_cents: 0 },
    { name: "Pro", price_cents: 900 },
    { name: "Enterprise", price_cents: null },
  ]);
  const org = home["@graph"].find((node) => node["@type"] === "Organization");
  check("homepage JSON-LD has an Organization", !!org);
  check(
    "Organization has contactPoint with email + contactType",
    org?.contactPoint?.[0]?.email === SUPPORT_EMAIL && !!org?.contactPoint?.[0]?.contactType
  );
  check("Organization has a PostalAddress", org?.address?.["@type"] === "PostalAddress");
  check("Organization sameAs links the studio GitHub profile", org?.sameAs?.includes("https://github.com/Two-Steps-Studio"));
  const app = home["@graph"].find((node) => node["@type"] === "SoftwareApplication");
  check("offers skip 'contact us' plans", Array.isArray(app?.offers) && app.offers.length === 2, JSON.stringify(app?.offers));
  check("offer price is a decimal string in EUR", app?.offers?.[1]?.price === "9.00" && app.offers[1].priceCurrency === "EUR");
  check("homepage identifies WebSite, WebPage and WebAPI", ["WebSite", "WebPage", "WebAPI"].every((type) => home["@graph"].some((node) => node["@type"] === type)));
  const contact = companyPageJsonLd(site, "ContactPage", "/contact", "Contact Guidon");
  check("contact page is a ContactPage about the Organization", contact["@graph"][1]["@type"] === "ContactPage" && contact["@graph"][1].about["@id"] === org["@id"]);
  const structuredSource = readFileSync(join(root, "src/lib/structured-data.ts"), "utf8");
  const companySource = readFileSync(join(root, "src/lib/company-pages.ts"), "utf8");
  for (const [file, source] of [["structured-data.ts", structuredSource], ["company-pages.ts", companySource]]) {
    check(`${file} copies the support email of lib/project-links.ts`, source.includes(`"${SUPPORT_EMAIL}"`));
    check(`${file} copies the GitHub URL of lib/project-links.ts`, source.includes(`"${GITHUB_REPO_URL}"`));
  }
}


console.log("\n  agent discovery documents");
{
  const site = "https://useguidon.com";
  const shipped = readFileSync(join(root, "agent-plugin/skills/guidon-tasks/SKILL.md"), "utf8");
  check("agent-plugin's SKILL.md is the served one (regenerate: agent-plugin/README.md)", shipped.replace(/\r\n/g, "\n") === skillMarkdown(site));
  const front = skillMarkdown(site).split("\n---\n")[0];
  check("SKILL.md frontmatter has name and description", front.startsWith("---\n") && front.includes(`name: ${SKILL_NAME}`) && /\ndescription: ".+"/.test(front));
  check("skill name follows the Agent Skills rule", /^[a-z0-9]+(-[a-z0-9]+)*$/.test(SKILL_NAME) && SKILL_NAME.length <= 64);
  const plugin = JSON.parse(readFileSync(join(root, "agent-plugin/plugin.json"), "utf8"));
  check("plugin.json has the 1.0.0 schema and a valid name", plugin.$schema === "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json" && /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(plugin.name));
  const rootPlugin = JSON.parse(readFileSync(join(root, "plugin.json"), "utf8"));
  check("repository-root plugin manifest is valid", rootPlugin.$schema === "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json" && rootPlugin.name === "guidon");
  const rootMcp = JSON.parse(readFileSync(join(root, "mcp.json"), "utf8"));
  check("repository-root MCP manifest lists product and docs servers without secrets", rootMcp.$schema === "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json" && rootMcp.mcpServers.guidon.url === `${site}/api/mcp` && rootMcp.mcpServers["guidon-docs"].url === `${site}/api/mcp/docs` && !JSON.stringify(rootMcp).toLowerCase().includes("authorization"));
  check("repository-root Agent Plugin skills are discoverable", ["guidon-tasks", "guidon-api", "guidon-cli"].every((name) => readFileSync(join(root, `skills/${name}/SKILL.md`), "utf8").startsWith("---\nname:")));
  check("MCP Apps document declares light and dark color schemes", DOCS_RESULTS_HTML.includes('<meta name="color-scheme" content="light dark">'));
  const mcp = JSON.parse(readFileSync(join(root, "agent-plugin/mcp.json"), "utf8"));
  check("plugin's mcp.json carries no credentials", !JSON.stringify(mcp).includes("guidon_") && !JSON.stringify(mcp).toLowerCase().includes("authorization"));

  for (const docs of [false, true]) {
    const card = mcpServerCard(site, docs);
    const label = docs ? "docs server card" : "server card";
    check(`${label}: pinned $schema`, card.$schema === "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json");
    check(`${label}: reverse-DNS name with one slash`, /^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/.test(card.name));
    check(`${label}: description 1-100 characters`, card.description.length >= 1 && card.description.length <= 100, card.description.length);
    check(`${label}: streamable-http remote on this site`, card.remotes[0].type === "streamable-http" && card.remotes[0].url.startsWith(`${site}/api/mcp`));
    check(`${label}: no tools list`, !("tools" in card));
  }

  const ard = ardCatalog(site);
  check("ARD: every identifier is a urn:air of this host", ard.entries.every((e) => /^urn:air:useguidon\.com(:[a-zA-Z0-9._-]+)+$/.test(e.identifier)));
  check("ARD: identifiers unique", new Set(ard.entries.map((e) => e.identifier)).size === ard.entries.length);
  check("ARD: 2-5 representative queries each", ard.entries.every((e) => e.representativeQueries.length >= 2 && e.representativeQueries.length <= 5));
  check("ARD: each entry has exactly one of url/data", ard.entries.every((e) => ("url" in e) !== ("data" in e)));
  const index = agentSkillsIndex(site, { skillDigest: "a".repeat(64) });
  check("skills index digest format", /^sha256:[0-9a-f]{64}$/.test(index.skills[0].digest) && index.skills[0].type === "skill-md");

  const robots = readFileSync(join(root, "src/app/robots.txt/route.ts"), "utf8");
  check("robots.txt names the sitemap, schemamap and agentmap", ["Sitemap:", "Schemamap:", "Agentmap:"].every((d) => robots.includes(d)));
}

console.log("\n  docs search");
{
  const page = { id: "p", title: "Guide", url: "https://x.example/guide", markdown: "# Guide\n\nIntro text about Guidon.\n\n## Rate limits\n\n60 requests per minute. Retry-After on 429.\n\n## Pagination\n\nPass next_cursor as cursor.\n" };
  const sections = splitSections(page);
  check("page splits into intro + one section per heading", sections.length === 3 && sections[1].url === "https://x.example/guide#rate-limits");
  const hits = searchSections(sections, "what is the rate limit?");
  check("best hit is the matching section", hits[0]?.title === "Guide - Rate limits", hits[0]?.title);
  check("snippet keeps underscores", searchSections(sections, "next cursor")[0]?.snippet.includes("next_cursor"));
  check("no match -> empty", searchSections(sections, "kubernetes helm").length === 0);
  check("stop words alone -> empty", searchSections(sections, "what is the").length === 0);
  check("authenticate finds authentication", searchSections(splitSections({ id: "x", title: "X", url: "u", markdown: "# X\n\n## Auth\n\nAuthentication with OAuth.\n" }), "How do I authenticate?").length === 1);
  check("tokens drop punctuation", tokens("How do I use OAuth?").join(" ") === "use oauth");
}

console.log("\n  A2A docs agent and MCP manifest");
{
  const site = "https://useguidon.com";
  const card = a2aAgentCard(site);
  check("agent card: v1.0 interface on /api/a2a", card.supportedInterfaces[0].url === `${site}/api/a2a` && card.supportedInterfaces[0].protocolBinding === "JSONRPC");
  check("agent card: v0.3 fields point to the same endpoint", card.url === `${site}/api/a2a` && card.preferredTransport === "JSONRPC");
  check("agent card: required fields", ["name", "description", "version", "capabilities", "defaultInputModes", "defaultOutputModes"].every((k) => k in card) && card.skills.every((s) => s.id && s.name && s.description && s.tags.length));
  let n = 0;
  const id = () => `id-${++n}`;
  const echo = (q) => `answer to ${q}`;
  const v1 = handleA2a({ jsonrpc: "2.0", id: 1, method: "SendMessage", params: { message: { role: "ROLE_USER", messageId: "m", parts: [{ text: "rate limits" }] } } }, echo, id);
  check("v1 SendMessage -> { message } with ROLE_AGENT text part", v1.result.message.role === "ROLE_AGENT" && v1.result.message.parts[0].text === "answer to rate limits" && v1.id === 1);
  const v03 = handleA2a({ jsonrpc: "2.0", id: "a", method: "message/send", params: { message: { kind: "message", role: "user", contextId: "ctx", parts: [{ kind: "text", text: "oauth" }] } } }, echo, id);
  check("v0.3 message/send -> kind message, keeps contextId", v03.result.kind === "message" && v03.result.role === "agent" && v03.result.contextId === "ctx" && v03.result.parts[0].kind === "text");
  check("no text part -> -32602", handleA2a({ jsonrpc: "2.0", id: 2, method: "SendMessage", params: { message: { parts: [{ file: {} }] } } }, echo, id).error.code === -32602);
  check("unknown method -> -32601", handleA2a({ jsonrpc: "2.0", id: 3, method: "nope" }, echo, id).error.code === -32601);
  check("GetTask -> task not found (-32001)", handleA2a({ jsonrpc: "2.0", id: 4, method: "GetTask" }, echo, id).error.code === -32001);
  check("not JSON-RPC 2.0 -> -32600", handleA2a({ method: "SendMessage" }, echo, id).error.code === -32600);
  const manifest = mcpManifest(site);
  check("MCP manifest: product kind on /api/mcp, docs server listed", manifest.kind === "product" && manifest.url === `${site}/api/mcp` && manifest.servers.some((s) => s.kind === "docs"));
  check("server cards carry their kind in _meta", mcpServerCard(site)._meta["ai.ora/kind"] === "product" && mcpServerCard(site, true)._meta["ai.ora/kind"] === "docs");
}

console.log(`\n  ${pass} pass / ${fail} fail\n`);
process.exit(fail ? 1 : 0);
