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
  "organizations",
  "plugins",
  "profile",
  "projects",
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
    `- [Guide for AI agents (llms.txt)](${siteUrl}/llms.txt)`,
    "",
    `## ${landing.featuresTitle}`,
    "",
    landing.featuresSubtitle,
    "",
    ...features,
    "## Legal",
    "",
    `- [Terms of Service](${siteUrl}/legal/terms)`,
    `- [Privacy Policy](${siteUrl}/legal/privacy)`,
    "",
  ].join("\n");
}
