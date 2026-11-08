import { SITE_URL } from "@/lib/site-url";

/**
 * Written by hand so the standard crawl rules can include the NLWeb
 * Schema Feeds extension. ARD is also discoverable through its well-known URL.
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
    `Schemamap: ${SITE_URL}/schemamap.xml`,
    `# Agentmap: ${SITE_URL}/.well-known/ard.json`,
    "",
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", Link: `<${SITE_URL}/.well-known/ard.json>; rel="ard"; type="application/ai-catalog+json"` } });
}
