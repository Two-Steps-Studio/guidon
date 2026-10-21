import { NextRequest, NextResponse } from "next/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticateApiKey } from "@/lib/api/api-key-auth";
import { isRateLimited, recordRequest } from "@/lib/api/rate-limit";
import { createDispatch } from "@/lib/mcp/http/dispatch";
import { registerGuidonTools } from "@/lib/mcp/http/tools";
import { registerProjectResourceTools } from "@/lib/mcp/http/resource-tools";
import { bearerChallenge } from "@/lib/oauth/oauth-core";
import { unknownToolError } from "@/lib/mcp/http/unknown-tool";
import { SITE_URL } from "@/lib/site-url";

/**
 * Guidon's MCP endpoint for external clients such as Claude Code:
 *
 *   claude mcp add --transport http guidon https://<host>/api/mcp \
 *     --header "Authorization: Bearer guidon_..."
 *
 * Stateless Streamable HTTP: a fresh McpServer + transport per request, JSON
 * responses (no SSE), no session ids. Identity is the same API key as
 * /api/v1; each tool then dispatches in-process to the matching /api/v1
 * route with the caller's own Authorization header (see
 * src/lib/mcp/http/dispatch.ts), so scopes, per-project AI permissions and
 * RLS behave exactly as for a direct API call.
 *
 * Rate limiting: a `tools/call` is counted exactly once, by the inner v1
 * handler's guardApiRequest. Everything else (initialize, tools/list, ping,
 * notifications, unparseable bodies) never reaches a v1 handler, so it is
 * counted here against the same per-key window - otherwise it would cost a
 * key lookup and a last_used_at write with no cap.
 *
 * Unrelated to the in-app project AI chat (src/components/ai/AIChat.tsx),
 * which dispatches its own tool calls in-process via src/lib/ai/chat-tools.ts
 * against session-based Server Actions, not this API-key-gated endpoint.
 */

/** One POST may carry a JSON-RPC batch; cap it so it cannot fan out unbounded tool calls. */
const MAX_BATCH_MESSAGES = 20;

const methodNotAllowed = () =>
  NextResponse.json(
    { error: "Method not allowed. This MCP endpoint is stateless and only supports POST." },
    { status: 405, headers: { Allow: "POST" } }
  );

function jsonRpcError(status: number, code: number, message: string) {
  return NextResponse.json({ jsonrpc: "2.0", error: { code, message }, id: null }, { status });
}

/**
 * The JSON-RPC message(s) in the body, or null when it is not parseable JSON.
 * Reads a clone so the transport can still consume the original request.
 */
async function peekMessages(request: NextRequest): Promise<unknown[] | null> {
  try {
    const body: unknown = await request.clone().json();
    return Array.isArray(body) ? body : [body];
  } catch {
    return null;
  }
}

function isToolCall(message: unknown): boolean {
  return !!message && typeof message === "object" && "method" in message && message.method === "tools/call";
}

async function handle(request: NextRequest): Promise<Response> {
  const authorization = request.headers.get("authorization");
  const identity = await authenticateApiKey(authorization);
  if (!identity || !authorization) {
    // RFC 9728: tells an MCP client where to start OAuth (Claude, ChatGPT...).
    return NextResponse.json(
      { error: "Invalid or missing API key or access token." },
      { status: 401, headers: { "WWW-Authenticate": bearerChallenge(SITE_URL, "/api/mcp") } }
    );
  }

  // Project-bound keys (migration 054) are browser/game report keys - the
  // tools would refuse them one by one via guardApiRequest anyway.
  if (identity.projectId) {
    return NextResponse.json({ error: "This API key is limited to one project and can't be used here." }, { status: 403 });
  }

  // Same status and body as guardApiRequest in src/lib/api/route-guard.ts.
  if (isRateLimited(identity.apiKeyId)) {
    return NextResponse.json({ error: "Rate limit exceeded. Try again shortly." }, { status: 429 });
  }

  const messages = await peekMessages(request);
  if (messages && messages.length > MAX_BATCH_MESSAGES) {
    return jsonRpcError(400, -32600, `Batch too large: at most ${MAX_BATCH_MESSAGES} messages per request.`);
  }
  // Unparseable body: the transport will answer with a JSON-RPC parse error;
  // it still cost a key lookup, so it counts as one request.
  const uncounted = messages ? messages.filter((message) => !isToolCall(message)).length : 1;
  for (let i = 0; i < uncounted; i++) recordRequest(identity.apiKeyId);

  const server = new McpServer(
    {
      name: "guidon",
      title: "Guidon",
      version: "1.0.0",
      description: "Guidon project management: find, claim, update and hand back tasks with full context.",
      websiteUrl: SITE_URL,
      icons: [{ src: `${SITE_URL}/icon.png`, mimeType: "image/png" }],
    },
    {
      instructions:
        "Guidon is a project-management board with the context behind each task. Typical flow: list_projects -> list_tasks -> " +
        "get_task_context (read everything, including previous attempts) -> start_task -> do the work -> record_attempt -> " +
        "comment_on_task (summary, PR link) -> set_task_status 'review'. Use complete_task only when the person asks and the " +
        "project allows it. You act as the signed-in user, only in their projects, limited to the token's scopes.",
    }
  );
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  try {
    const dispatch = createDispatch(new URL(request.url).origin, authorization);
    registerGuidonTools(server, dispatch);
    registerProjectResourceTools(server, dispatch);
    const unknown = unknownToolError(server, messages);
    if (unknown) return unknown;
    await server.connect(transport);
    return await transport.handleRequest(request);
  } finally {
    // JSON-response mode has fully resolved by now; release the per-request
    // server/transport pair even when connect() or handleRequest() threw.
    await transport.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }
}

export async function POST(request: NextRequest) {
  try {
    return await handle(request);
  } catch (error) {
    // Never echo the underlying message (DB errors etc.) to the caller.
    console.error("[mcp] unhandled error:", error);
    return jsonRpcError(500, -32603, "Internal error");
  }
}

export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
