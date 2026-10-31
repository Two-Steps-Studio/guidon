import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/auth-helpers";
import { serviceDataClient } from "@/lib/data-client";
import { SITE_URL } from "@/lib/site-url";
import { ipRateLimit } from "@/lib/ip-rate-limit";
import { isSearchEvent } from "@/lib/search/search-metrics";

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== new URL(SITE_URL).origin) return new NextResponse(null, {status:403});
  const rate = ipRateLimit("search-metrics", request, 120);
  if (rate.limited) return new NextResponse(null, {status:429, headers:rate.headers});
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  if (!request.body) return new NextResponse(null, {status:400});
  // Bound actual streamed bytes, not just an optional Content-Length header.
  const reader = request.body.getReader();
  let body = "", bytes = 0;
  try {
    const decoder = new TextDecoder();
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 16) { await reader.cancel(); return new NextResponse(null, {status:413}); }
      body += decoder.decode(chunk.value, {stream:true});
    }
    body += decoder.decode();
  } catch { return new NextResponse(null, {status:400}); }
  finally { reader.releaseLock(); }
  if (!isSearchEvent(body)) return new NextResponse(null, {status:400});
  // Privileged write is ONLY an anonymous global counter after session auth;
  // it cannot read tasks and the RPC has no field for an identity or query.
  const result = await serviceDataClient().rpc("record_search_event", {p_event:body});
  return new NextResponse(null, {status:result.error ? 503 : 204});
}
