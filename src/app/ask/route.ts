import { NextRequest } from "next/server";
import { docSections } from "@/lib/docs-index";
import { searchSections, type SearchHit } from "@/lib/docs-search-core";
import { ipRateLimit, withHeaders } from "@/lib/ip-rate-limit";

/**
 * NLWeb (v0.55) /ask over Guidon's public documentation: `POST { "query":
 * { "text": "..." } }` (or `GET ?query=...`) returns schema.org items for
 * the best-matching sections. `prefer.streaming: true` (or Accept:
 * text/event-stream) streams start/result/complete events. Only public
 * pages - a person's projects are behind the API and MCP server.
 */

const VERSION = "0.55";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
};

type AskInput = { text: string; streaming: boolean } | { error: string };

function item(hit: SearchHit) {
  return {
    "@type": "WebPage",
    name: hit.title,
    url: hit.url,
    description: hit.snippet,
    isPartOf: { "@type": "WebSite", name: "Guidon", url: new URL(hit.url).origin },
    grounding: { source_urls: [hit.url] },
  };
}

function failure(code: string, message: string, status = 200) {
  return Response.json({ _meta: { response_type: "failure", version: VERSION }, error: { code, message } }, { status, headers: CORS });
}

function answer(text: string, streaming: boolean): Response {
  const hits = searchSections(docSections(), text, 8);
  if (!streaming) {
    if (hits.length === 0) return failure("NO_RESULTS", "Nothing in Guidon's documentation matches that question.");
    return Response.json(
      { _meta: { response_type: "answer", response_format: "conversational_search", version: VERSION }, results: hits.map(item) },
      { headers: CORS }
    );
  }

  const encoder = new TextEncoder();
  const event = (name: string, data: unknown) => encoder.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(event("start", { _meta: { response_type: "answer", response_format: "conversational_search", version: VERSION, streaming: true } }));
      if (hits.length === 0) {
        controller.enqueue(event("error", { _meta: { response_type: "failure", version: VERSION }, error: { code: "NO_RESULTS", message: "Nothing in Guidon's documentation matches that question." } }));
      }
      hits.forEach((hit, index) => controller.enqueue(event("result", { index, item: item(hit) })));
      controller.enqueue(event("complete", { _meta: { response_type: "answer", version: VERSION } }));
      controller.close();
    },
  });
  return new Response(stream, { headers: { ...CORS, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
}

function wantsStream(request: NextRequest, prefer: unknown): boolean {
  if (prefer && typeof prefer === "object" && (prefer as { streaming?: unknown }).streaming === true) return true;
  return (request.headers.get("accept") ?? "").includes("text/event-stream");
}

async function readInput(request: NextRequest): Promise<AskInput> {
  if (request.method === "GET") {
    const text = request.nextUrl.searchParams.get("query") ?? request.nextUrl.searchParams.get("q") ?? "";
    return { text, streaming: request.nextUrl.searchParams.get("streaming") === "true" || wantsStream(request, null) };
  }
  const body = (await request.json().catch(() => null)) as { query?: { text?: unknown } | string; prefer?: unknown } | null;
  if (!body) return { error: "Send JSON: { \"query\": { \"text\": \"...\" } }." };
  const text = typeof body.query === "string" ? body.query : body.query?.text;
  return { text: typeof text === "string" ? text : "", streaming: wantsStream(request, body.prefer) };
}

async function handle(request: NextRequest): Promise<Response> {
  const rate = ipRateLimit("ask", request, 60);
  const respond = (response: Response) => withHeaders(response, rate.headers);
  if (rate.limited) return respond(failure("RATE_LIMITED", "Too many questions. Try again in a minute.", 429));
  const input = await readInput(request);
  if ("error" in input) return respond(failure("INVALID_QUERY", input.error, 400));
  const text = input.text.trim();
  if (!text || text.length > 1000) return respond(failure("INVALID_QUERY", "query.text must be 1-1000 characters."));
  return respond(answer(text, input.streaming));
}

export const GET = handle;
export const POST = handle;

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
