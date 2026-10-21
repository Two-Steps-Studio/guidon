import { NextResponse } from "next/server";
import { protectedResourceMetadata } from "@/lib/oauth/oauth-core";
import { SITE_URL } from "@/lib/site-url";

/**
 * RFC 9728 protected resource metadata. The path after the well-known name
 * is the resource's own path (3.1): /api/mcp for the MCP server, /api/v1
 * for the REST API, nothing for the site as a whole. `resource` must be
 * exactly the URL the client derived this address from.
 */
const RESOURCES: Record<string, string> = {
  "": SITE_URL,
  "api/mcp": `${SITE_URL}/api/mcp`,
  "api/v1": `${SITE_URL}/api/v1`,
};

const headers = { "Cache-Control": "public, max-age=3600", "Access-Control-Allow-Origin": "*" };

export async function GET(_request: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path } = await params;
  const resource = RESOURCES[(path ?? []).join("/")];
  if (!resource) {
    return NextResponse.json({ error: "No protected resource at this path.", code: "not_found" }, { status: 404, headers });
  }
  return NextResponse.json(protectedResourceMetadata(SITE_URL, resource), { headers });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { ...headers, "Access-Control-Allow-Methods": "GET" } });
}
