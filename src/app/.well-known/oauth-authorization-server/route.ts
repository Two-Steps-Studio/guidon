import { NextResponse } from "next/server";
import { authorizationServerMetadata } from "@/lib/oauth/oauth-core";
import { SITE_URL } from "@/lib/site-url";
import { agentSigningKey } from "@/lib/oauth/agent-claims-core";

/** RFC 8414 authorization server metadata - where MCP clients find /oauth/authorize, /oauth/token and /oauth/register. */
const headers = { "Cache-Control": "public, max-age=3600", "Access-Control-Allow-Origin": "*" };

export function GET() {
  return NextResponse.json(authorizationServerMetadata(SITE_URL, Boolean(agentSigningKey())), { headers });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { ...headers, "Access-Control-Allow-Methods": "GET" } });
}
