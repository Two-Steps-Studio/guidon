import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/auth-helpers";
import { serviceDataClient } from "@/lib/data-client";
import { SITE_URL } from "@/lib/site-url";
import { ipRateLimit } from "@/lib/ip-rate-limit";
import { isSearchEvent } from "@/lib/search/search-metrics";
import { readLimitedText } from "@/lib/api/limited-text";

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== new URL(SITE_URL).origin) return new NextResponse(null, {status:403});
  const rate = ipRateLimit("search-metrics", request, 120);
  if (rate.limited) return new NextResponse(null, {status:429, headers:rate.headers});
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const body = await readLimitedText(request, 16);
  if (!body.ok) return new NextResponse(null, {status:body.status});
  if (!isSearchEvent(body.text)) return new NextResponse(null, {status:400});
  // Privileged write is ONLY an anonymous global counter after session auth;
  // it cannot read tasks and the RPC has no field for an identity or query.
  const result = await serviceDataClient().rpc("record_search_event", {p_event:body.text});
  return new NextResponse(null, {status:result.error ? 503 : 204});
}
