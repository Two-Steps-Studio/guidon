import { SITE_URL } from "@/lib/site-url";

/** NLWeb Schema Feeds map (referenced from robots.txt): where the site's structured data lives as JSONL. */
export const dynamic = "force-static";

export function GET() {
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:sf="http://schema.org/schemas/schemafeed/0.1">
  <url>
    <loc>${SITE_URL}/feeds/site.jsonl</loc>
    <sf:contentType>structuredData/schema.org</sf:contentType>
  </url>
</urlset>
`;
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
