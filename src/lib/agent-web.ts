// No imports: loaded by tests/agent-web.test.mjs with Node's type stripping,
// and by src/proxy.ts on every request.

/**
 * Makes the public site readable by AI agents without changing what browsers
 * get: unknown paths answer a real 404 instead of a login redirect (a
 * "soft 404" made agents conclude every path exists), and a request that
 * asks for `Accept: text/markdown` gets Markdown instead of the HTML app
 * shell (https://acceptmarkdown.com).
 */

/**
 * Top-level path segments that are real, sign-in-only parts of the app. An
 * anonymous request under one of these still goes to the login page; any
 * other first segment that isn't a public route has no page at all, so it
 * gets a 404 instead. tests/agent-web.test.mjs fails if a new folder under
 * src/app is neither listed here nor public in proxy.ts.
 */
export const SIGNED_IN_SECTIONS: ReadonlySet<string> = new Set([
  "admin",
  "api",
  "dashboard",
  "discord",
  "mini",
  "marketplace",
  "my-modules",
  "my-tasks",
  "oauth",
  "organizations",
  "plugins",
  "profile",
  "projects",
  "sandbox",
  "upgrade",
]);

export function isSignedInSection(pathname: string): boolean {
  const first = pathname.split("/")[1] ?? "";
  return SIGNED_IN_SECTIONS.has(first);
}

/**
 * Parses an Accept header into media ranges with their q-values. Malformed
 * q-values count as 1, the HTTP default.
 */
function parseAccept(accept: string): Array<{ type: string; q: number }> {
  return accept
    .split(",")
    .map((part) => {
      const [type, ...params] = part.trim().split(";");
      let q = 1;
      for (const param of params) {
        const [key, value] = param.trim().split("=");
        if (key?.trim().toLowerCase() === "q") {
          const parsed = Number(value);
          if (Number.isFinite(parsed)) q = parsed;
        }
      }
      return { type: type.trim().toLowerCase(), q };
    })
    .filter((entry) => entry.type.length > 0);
}

/**
 * True when the client explicitly asks for Markdown and doesn't rank HTML
 * above it. Browsers never list text/markdown, so they always get HTML; a
 * `*\/*` wildcard alone never selects Markdown.
 */
export function prefersMarkdown(accept: string | null | undefined): boolean {
  if (!accept) return false;
  const ranges = parseAccept(accept);
  const markdown = ranges.find((r) => r.type === "text/markdown")?.q ?? 0;
  if (markdown <= 0) return false;
  const html = Math.max(
    0,
    ...ranges.filter((r) => r.type === "text/html" || r.type === "application/xhtml+xml").map((r) => r.q)
  );
  return markdown >= html;
}

export const MARKDOWN_CONTENT_TYPE = "text/markdown; charset=utf-8";

export function notFoundMarkdown(pathname: string, siteUrl: string): string {
  // Backticks in the path would end the inline code span early.
  const shown = pathname.replace(/`/g, "%60");
  return `# 404 - Page not found

There is no page at \`${shown}\` on Guidon. The address may be mistyped, or the page may have moved.

Where to go instead:

- [Guidon homepage](${siteUrl}/) - what Guidon is and what it does
- [llms.txt](${siteUrl}/llms.txt) - a guide for AI agents: when to use Guidon and how to call its API and MCP server
- [Sitemap](${siteUrl}/sitemap.xml) - every public page
`;
}

/** The `landing` namespace of messages/<locale>.json, as far as it's used here. */
export interface LandingMessages {
  heroTitle: string;
  heroSubtitle: string;
  featuresTitle: string;
  featuresSubtitle: string;
  features: Record<string, { title: string; description: string; bullets: string[] }>;
  faq?: { title: string; items: { q: string; a: string }[] };
}

/** Same order as FEATURE_SECTIONS in src/app/page.tsx. */
export const LANDING_FEATURE_KEYS = [
  "taskBoard",
  "aiTaskApi",
  "decisions",
  "knowledgeBase",
  "memoryContext",
  "roadmap",
] as const;

/**
 * The homepage as Markdown, built from the same copy the HTML page renders
 * (messages/en.json's `landing`), so the two never drift apart.
 */
export function homepageMarkdown(landing: LandingMessages, siteUrl: string): string {
  const features = LANDING_FEATURE_KEYS.flatMap((key) => {
    const feature = landing.features[key];
    if (!feature) return [];
    return [`### ${feature.title}`, "", feature.description, "", ...feature.bullets.map((b) => `- ${b}`), ""];
  });

  return [
    `# Guidon - ${landing.heroTitle}`,
    "",
    landing.heroSubtitle,
    "",
    `- [Get started](${siteUrl}/auth/signup)`,
    `- [Sign in](${siteUrl}/auth/login)`,
    `- [Free Cloud plan](${siteUrl}/#pricing)`,
    `- [Create an API key yourself](${siteUrl}/developers#authentication)`,
    `- [Try the API and agent sandbox](${siteUrl}/sandbox)`,
    `- [Guide for AI agents (llms.txt)](${siteUrl}/llms.txt)`,
    "",
    "## For AI agents",
    "",
    "Guidon is built to be used by agents as well as people. Everything below acts as a Guidon user, in the projects they can access.",
    "",
    `- **MCP server:** \`${siteUrl}/api/mcp\` (Streamable HTTP) - find, claim, update and hand back tasks; read and write decisions, knowledge, roadmap and memory.`,
    `- **REST API:** \`${siteUrl}/api/v1\` - [OpenAPI 3.1](${siteUrl}/openapi.json), JSON errors with codes, rate-limit headers, Idempotency-Key, cursor pagination, batch.`,
    `- **Authentication:** OAuth 2.1 with PKCE (MCP clients sign in on their own - [auth.md](${siteUrl}/auth.md)) or a personal API key as \`Authorization: Bearer guidon_...\`.`,
    `- **Docs for agents:** [llms.txt](${siteUrl}/llms.txt), [developer guide](${siteUrl}/developers.md), a public [docs MCP server](${siteUrl}/api/mcp/docs) and [/ask](${siteUrl}/ask).`,
    `- **Discovery:** [ard.json](${siteUrl}/.well-known/ard.json), [MCP server card](${siteUrl}/api/mcp/server-card), [agent skill](${siteUrl}/.well-known/agent-skills/index.json), [API catalog](${siteUrl}/.well-known/api-catalog), [MCP manifest](${siteUrl}/.well-known/mcp.json), [A2A agent card](${siteUrl}/.well-known/agent-card.json).`,
    "",
    `## ${landing.featuresTitle}`,
    "",
    landing.featuresSubtitle,
    "",
    ...features,
    ...(landing.faq ? [`## ${landing.faq.title}`, "", ...landing.faq.items.flatMap((item) => [`### ${item.q}`, "", item.a, ""])] : []),
    "## Company",
    "",
    `- [About Guidon](${siteUrl}/about)`,
    `- [Contact](${siteUrl}/contact)`,
    `- [Sandbox for the API and agents](${siteUrl}/sandbox)`,
    "",
    "## Legal",
    "",
    `- [Terms of Service](${siteUrl}/legal/terms)`,
    `- [Privacy Policy](${siteUrl}/legal/privacy)`,
    "",
  ].join("\n");
}

/**
 * Opens a served Markdown document with a `---` frontmatter block, so agents
 * get its title, description, canonical URL and date without scraping.
 * Values are JSON-quoted, which is valid YAML for any string.
 */
export function withFrontmatter(
  markdown: string,
  meta: { title: string; description?: string; canonical?: string; lastUpdated?: string }
): string {
  const lines = ["---", `title: ${JSON.stringify(meta.title)}`];
  if (meta.description) lines.push(`description: ${JSON.stringify(meta.description)}`);
  if (meta.canonical) lines.push(`canonical: ${JSON.stringify(meta.canonical)}`);
  if (meta.lastUpdated) lines.push(`last-updated: ${JSON.stringify(meta.lastUpdated)}`);
  lines.push("---", "");
  return `${lines.join("\n")}${markdown}`;
}

/**
 * AI crawlers and AI assistants fetching a page for a user. They get the
 * Markdown twin of a page even when they ask for HTML - the same content
 * without the app shell. Search-engine crawlers (Googlebot, Bingbot) are
 * deliberately not here: they index the HTML page itself.
 */
const AI_BOT_PATTERN =
  /\b(GPTBot|ChatGPT-User|OAI-SearchBot|ClaudeBot|Claude-User|Claude-SearchBot|anthropic-ai|PerplexityBot|Perplexity-User|Google-Extended|Applebot-Extended|DeepSeekBot|ora-agent|cohere-ai|MistralAI-User)\b/i;

export function isAiAgentUserAgent(userAgent: string | null | undefined): boolean {
  return !!userAgent && AI_BOT_PATTERN.test(userAgent);
}

/**
 * Public HTML pages that have a Markdown twin. The proxy serves the twin to
 * `Accept: text/markdown`, `?mode=agent` and AI user agents; each twin is
 * also reachable at its own URL.
 */
export const MARKDOWN_TWINS: Readonly<Record<string, string>> = {
  "/": "/index.md",
  "/developers": "/developers.md",
  "/about": "/about.md",
  "/contact": "/contact.md",
  "/sandbox": "/sandbox.md",
  "/auth/login": "/auth/login.md",
  "/auth/signup": "/auth/signup.md",
};

/** Plan fields the pricing Markdown needs (the `plans` table, migration 015 and later). */
export interface PricingPlan {
  name: string;
  price_cents: number | null;
  price_pln_cents?: number | null;
  project_limit: number | null;
  task_limit_per_project: number | null;
  member_limit?: number | null;
  storage_limit_bytes: number | null;
  has_ai_features: boolean;
  has_github_integration: boolean;
  has_advanced_analytics: boolean;
  has_team_roles: boolean;
  has_audit_logs: boolean;
  has_priority_support: boolean;
}

function limit(value: number | null | undefined, unit: string): string {
  return value === null || value === undefined ? `Unlimited ${unit}` : `${value} ${unit}`;
}

function storage(bytes: number | null): string {
  if (bytes === null) return "Unlimited storage";
  const gb = bytes / (1024 * 1024 * 1024);
  return gb >= 1 ? `${Math.round(gb)} GB storage` : `${Math.round(bytes / (1024 * 1024))} MB storage`;
}

/** /pricing.md: Guidon Cloud's plans as plain Markdown, from the same `plans` rows the landing page shows. */
export function pricingMarkdown(plans: PricingPlan[], siteUrl: string): string {
  const sections = plans.flatMap((plan) => {
    const price =
      plan.price_cents === null
        ? "Custom pricing - contact us"
        : plan.price_cents === 0
          ? "Free"
          : `€${(plan.price_cents / 100).toFixed(2)} per month` +
            (plan.price_pln_cents ? ` (${(plan.price_pln_cents / 100).toFixed(2)} zł)` : "");
    const features = [
      plan.has_ai_features && "AI Task API and MCP server for agents",
      plan.has_github_integration && "GitHub integration",
      plan.has_advanced_analytics && "Advanced analytics",
      plan.has_team_roles && "Team roles",
      plan.has_audit_logs && "Audit logs",
      plan.has_priority_support && "Priority support",
    ].filter(Boolean);
    return [
      `## ${plan.name}`,
      "",
      `- Price: ${price}`,
      `- ${limit(plan.project_limit, "projects")}`,
      `- ${limit(plan.task_limit_per_project, "tasks per project")}`,
      ...(plan.member_limit !== undefined ? [`- ${limit(plan.member_limit, "members")}`] : []),
      `- ${storage(plan.storage_limit_bytes)}`,
      ...features.map((feature) => `- ${feature}`),
      "",
    ];
  });

  return [
    "# Guidon pricing",
    "",
    "Plans for Guidon Cloud (https://useguidon.com), billed per organization. Guidon can also be self-hosted, where these limits and prices don't apply.",
    "",
    ...(sections.length ? sections : ["Pricing is not available right now - see the homepage.", ""]),
    `Sign up: ${siteUrl}/auth/signup - Upgrade from an organization's billing page.`,
    "",
  ].join("\n");
}
