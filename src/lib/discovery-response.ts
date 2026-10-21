import "server-only";

import { createHash } from "node:crypto";

/**
 * A public discovery document: open CORS, an hour of caching, and an ETag
 * honoured on If-None-Match (the MCP server-card extension requires all
 * three; the other documents benefit the same way).
 */
export function discoveryResponse(request: Request, body: string, contentType: string): Response {
  const etag = `"${createHash("sha256").update(body).digest("base64url").slice(0, 27)}"`;
  const headers = {
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=3600",
    ETag: etag,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD",
    "Access-Control-Allow-Headers": "Content-Type, If-None-Match",
    "Access-Control-Expose-Headers": "ETag",
  };
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return new Response(request.method === "HEAD" ? null : body, { headers });
}

export function discoveryPreflight(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD",
      "Access-Control-Allow-Headers": "Content-Type, If-None-Match",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export const sha256Hex = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
