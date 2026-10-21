import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { docPages, docSections } from "@/lib/docs-index";
import { searchSections } from "@/lib/docs-search-core";
import { ipRateLimited } from "@/lib/ip-rate-limit";

/**
 * Guidon's documentation as an MCP server - the "learn" counterpart of
 * /api/mcp (the "do"). Public: it serves only what the site already
 * publishes (developer guide, auth, the agent skill, about...), so there is
 * nothing to authenticate. Stateless, JSON responses, like /api/mcp.
 */

const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;

function buildServer(): McpServer {
  const server = new McpServer({ name: "guidon-docs", version: "1.0.0" });
  const pages = docPages();

  server.registerTool(
    "search_docs",
    {
      description:
        "Search Guidon's public documentation (REST API, MCP server, authentication/OAuth, errors, rate limits, the agent workflow, company info). " +
        "Returns the best-matching sections with their URL - read a whole page with read_doc.",
      inputSchema: { query: z.string().min(1).max(500).describe("What you want to know, in plain words.") },
      annotations: { title: "Search Guidon docs", ...READ_ONLY },
    },
    ({ query }) => {
      const hits = searchSections(docSections(), query, 6);
      const text = hits.length
        ? hits.map((hit, i) => `${i + 1}. ${hit.title}\n   ${hit.url}\n   ${hit.snippet}`).join("\n\n")
        : "No matching documentation. Try other words, or read_doc with one of: " + pages.map((p) => p.id).join(", ");
      return {
        content: [{ type: "text", text }],
        structuredContent: { results: hits.map(({ title, url, snippet, pageId, score }) => ({ title, url, snippet, page: pageId, score })) },
      };
    }
  );

  server.registerTool(
    "read_doc",
    {
      description: `Read one page of Guidon's documentation in full, as Markdown. Pages: ${pages.map((p) => `${p.id} (${p.title})`).join(", ")}.`,
      inputSchema: { page: z.enum(pages.map((p) => p.id) as [string, ...string[]]).describe("Page id.") },
      annotations: { title: "Read a Guidon docs page", ...READ_ONLY },
    },
    ({ page }) => {
      const found = pages.find((p) => p.id === page)!;
      return { content: [{ type: "text", text: `Source: ${found.url}\n\n${found.markdown}` }] };
    }
  );

  for (const page of pages) {
    server.registerResource(
      page.id,
      page.url,
      { title: page.title, description: `Guidon docs: ${page.title}`, mimeType: "text/markdown" },
      async () => ({ contents: [{ uri: page.url, mimeType: "text/markdown", text: page.markdown }] })
    );
  }
  return server;
}

export async function POST(request: NextRequest) {
  if (ipRateLimited("mcp-docs", request, 120)) {
    return NextResponse.json({ jsonrpc: "2.0", error: { code: -32000, message: "Rate limit exceeded. Try again shortly." }, id: null }, { status: 429, headers: { "Retry-After": "60" } });
  }
  const server = buildServer();
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  try {
    await server.connect(transport);
    return await transport.handleRequest(request);
  } catch (error) {
    console.error("[mcp/docs]", error);
    return NextResponse.json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null }, { status: 500 });
  } finally {
    await transport.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }
}

const methodNotAllowed = () =>
  NextResponse.json({ error: "This MCP endpoint is stateless and only supports POST." }, { status: 405, headers: { Allow: "POST" } });

export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
