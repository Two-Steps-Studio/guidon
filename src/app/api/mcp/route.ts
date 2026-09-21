import { NextRequest, NextResponse } from "next/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticateApiKey } from "@/lib/api/api-key-auth";
import { createDispatch } from "@/lib/mcp/http/dispatch";
import { registerGuidonTools } from "@/lib/mcp/http/tools";

/**
 * Guidon's MCP endpoint for external clients such as Claude Code:
 *
 *   claude mcp add --transport http guidon https://<host>/api/mcp \
 *     --header "Authorization: Bearer gdn_..."
 *
 * Stateless Streamable HTTP: a fresh McpServer + transport per request, JSON
 * responses (no SSE), no session ids. Identity is the same API key as
 * /api/v1; each tool then dispatches in-process to the matching /api/v1
 * route with the caller's own Authorization header (see
 * src/lib/mcp/http/dispatch.ts), so scopes, rate limits, per-project AI
 * permissions and RLS behave exactly as for a direct API call. Rate limiting
 * is therefore counted by those inner calls, not here.
 *
 * Unrelated to the stdio MCP server in src/lib/mcp/server.ts, which serves
 * the in-app AI chat.
 */

const methodNotAllowed = () =>
  NextResponse.json(
    { error: "Method not allowed. This MCP endpoint is stateless and only supports POST." },
    { status: 405, headers: { Allow: "POST" } }
  );

export async function POST(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const identity = await authenticateApiKey(authorization);
  if (!identity || !authorization) {
    return NextResponse.json({ error: "Invalid or missing API key." }, { status: 401 });
  }

  const server = new McpServer({ name: "guidon", version: "1.0.0" });
  registerGuidonTools(server, createDispatch(new URL(request.url).origin, authorization));

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);

  try {
    return await transport.handleRequest(request);
  } finally {
    // JSON-response mode has fully resolved by now; release the per-request
    // server/transport pair.
    await transport.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }
}

export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
