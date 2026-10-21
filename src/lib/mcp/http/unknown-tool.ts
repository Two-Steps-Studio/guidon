import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * A tools/call for a tool the server doesn't have gets a JSON-RPC error
 * (-32602, Invalid params) with a message listing the tools - what the MCP
 * spec asks for. The SDK version in use answers it as a normal tool result
 * with isError instead, which agents can't tell apart from a tool that ran
 * and failed.
 *
 * Only for a single (non-batch) message; null when there is nothing to answer.
 */
export function unknownToolError(server: McpServer, messages: unknown[] | null): Response | null {
  if (!messages || messages.length !== 1) return null;
  const message = messages[0] as { method?: unknown; id?: unknown; params?: { name?: unknown } } | null;
  if (!message || message.method !== "tools/call") return null;
  // The SDK keeps registered tools in a private map; reading it is the only
  // way to know them before the transport runs.
  const tools = Object.keys((server as unknown as { _registeredTools?: Record<string, unknown> })._registeredTools ?? {});
  const name = message.params?.name;
  if (typeof name === "string" && tools.includes(name)) return null;
  return Response.json(
    {
      jsonrpc: "2.0",
      id: (message.id as string | number | null) ?? null,
      error: {
        code: -32602,
        message: typeof name === "string" ? `Unknown tool: ${name}` : "params.name is required",
        data: { availableTools: tools },
      },
    },
    { status: 200 }
  );
}
