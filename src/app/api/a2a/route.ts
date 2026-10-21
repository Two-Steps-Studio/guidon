import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { handleA2a, rpcError, type JsonRpcRequest } from "@/lib/a2a-core";
import { docPages, docSections } from "@/lib/docs-index";
import { searchSections } from "@/lib/docs-search-core";
import { ipRateLimit, withHeaders } from "@/lib/ip-rate-limit";
import { SITE_URL } from "@/lib/site-url";

/**
 * A2A docs agent (card: /.well-known/agent-card.json). Public, like the docs
 * MCP server and /ask: it answers from what the site already publishes, so
 * there is nothing to authenticate. The answer is the best-matching docs
 * sections with links - search, not a language model, so it never makes
 * anything up.
 */

function answer(question: string): string {
  const hits = searchSections(docSections(), question, 3);
  if (!hits.length) {
    return `I found nothing about that in Guidon's documentation. Pages you can read: ${docPages()
      .map((page) => `[${page.title}](${page.url})`)
      .join(", ")}. Or ask at ${SITE_URL}/contact.`;
  }
  return hits.map((hit) => `**[${hit.title}](${hit.url})**\n\n${hit.snippet}`).join("\n\n---\n\n");
}

export async function POST(request: NextRequest) {
  const rate = ipRateLimit("a2a", request, 60);
  if (rate.limited) {
    return withHeaders(NextResponse.json(rpcError(null, -32000, "Rate limit exceeded. Try again shortly."), { status: 429 }), rate.headers);
  }
  const body = (await request.json().catch(() => null)) as JsonRpcRequest | null;
  if (!body) return withHeaders(NextResponse.json(rpcError(null, -32700, "Parse error: the body must be JSON.")), rate.headers);
  return withHeaders(NextResponse.json(handleA2a(body, answer, randomUUID)), rate.headers);
}

export function GET() {
  return NextResponse.json(
    { error: "This is an A2A JSON-RPC endpoint: POST SendMessage or message/send.", agent_card: `${SITE_URL}/.well-known/agent-card.json` },
    { status: 405, headers: { Allow: "POST" } }
  );
}
