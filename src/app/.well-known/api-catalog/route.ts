import { SITE_URL } from "@/lib/site-url";

/**
 * API catalog (RFC 9727): where Guidon's APIs and their descriptions are, for
 * agents discovering the site from its domain alone. One entry per API - the
 * REST API (OpenAPI spec, developer guide) and the MCP server.
 */
const CONTENT_TYPE = 'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"';

function catalog() {
  return {
    linkset: [
      {
        anchor: `${SITE_URL}/api/v1`,
        "service-desc": [{ href: `${SITE_URL}/openapi.json`, type: "application/vnd.oai.openapi+json;version=3.1" }],
        "service-doc": [{ href: `${SITE_URL}/developers`, type: "text/html" }],
        "service-meta": [{ href: `${SITE_URL}/llms.txt`, type: "text/plain" }],
      },
      {
        anchor: `${SITE_URL}/api/mcp`,
        "service-doc": [{ href: `${SITE_URL}/developers#mcp-server`, type: "text/html" }],
      },
    ],
  };
}

const headers = {
  "Content-Type": CONTENT_TYPE,
  "Cache-Control": "public, max-age=3600",
  "Access-Control-Allow-Origin": "*",
  // RFC 9727 section 2: the catalog advertises itself.
  Link: `<${SITE_URL}/.well-known/api-catalog>; rel="api-catalog"`,
};

export function GET() {
  return new Response(JSON.stringify(catalog(), null, 2), { headers });
}

export function HEAD() {
  return new Response(null, { headers });
}
