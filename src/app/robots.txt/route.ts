import { SITE_URL } from "@/lib/site-url";

/**
 * robots.txt, written by hand rather than with Next's MetadataRoute (which
 * crawl rules and sitemap. Extra discovery URLs are comments so standard
 * robots parsers do not treat experimental vocabulary as invalid directives.
 * Agents discover ARD through its well-known URL and HTTP/HTML links.
 */
export const dynamic = "force-static";

export function GET() {
  const body = [
    "User-agent: *",
    "Allow: /",
    ...["/admin", "/api", "/dashboard", "/organizations", "/projects", "/profile"].map((path) => `Disallow: ${path}`),
    // The public API descriptions under /api stay crawlable.
    "Allow: /api/mcp/server-card",
    "Allow: /api/mcp/docs/server-card",
    "",
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    `# Schemamap: ${SITE_URL}/schemamap.xml`,
    `# Agentmap: ${SITE_URL}/.well-known/ard.json`,
    "",
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", Link: `<${SITE_URL}/.well-known/ard.json>; rel="ard"; type="application/ai-catalog+json"` } });
}
