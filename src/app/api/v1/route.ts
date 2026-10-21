import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api/api-route";
import { SITE_URL } from "@/lib/site-url";

/**
 * GET /api/v1: what this API is and where everything is - for an agent
 * that lands on the base URL. Public; carries the same RateLimit headers
 * as every other /api/v1 response.
 */
async function handleGET() {
  return NextResponse.json({
    name: "Guidon API",
    version: "v1",
    description: "Tasks, comments, attempts, decisions, knowledge, roadmap and memory of Guidon projects, for AI agents and integrations.",
    openapi: `${SITE_URL}/openapi.json`,
    documentation: `${SITE_URL}/developers`,
    authentication: {
      guide: `${SITE_URL}/auth.md`,
      oauth_authorization_server: `${SITE_URL}/.well-known/oauth-authorization-server`,
      protected_resource_metadata: `${SITE_URL}/.well-known/oauth-protected-resource/api/v1`,
      api_keys: `${SITE_URL}/profile`,
    },
    mcp: { product: `${SITE_URL}/api/mcp`, docs: `${SITE_URL}/api/mcp/docs` },
    sandbox: `${SITE_URL}/sandbox`,
    rate_limits: "60 requests per minute per key (RateLimit-* headers on every response; Retry-After on 429).",
  });
}

export const GET = apiRoute(handleGET);
