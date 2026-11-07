import { NextRequest, NextResponse } from "next/server";
import { serviceDataClient } from "@/lib/data-client";
import { isFunnelCta } from "@/lib/funnel";
import { ipRateLimit } from "@/lib/ip-rate-limit";
import { readLimitedText } from "@/lib/api/limited-text";

/**
 * Counts a click on a landing-page sign-up button (migration 096): adds one
 * to today's total for that button name. No cookie, identifier or IP is
 * stored, so it needs no consent. Sent with navigator.sendBeacon from
 * CtaLink; public route (src/proxy.ts). Service role, because no signed-in
 * role may write the counters.
 */
export async function POST(request: NextRequest) {
  // A real visitor clicks a sign-up button a few times at most; without a cap
  // anyone could loop this and skew the admin funnel.
  const rate = ipRateLimit("funnel-cta", request, 10);
  if (rate.limited) return new NextResponse(null, { status: 429, headers: rate.headers });
  const body = await readLimitedText(request, 200);
  if (!body.ok) return new NextResponse(null, { status: body.status });
  const cta = body.text.trim();
  if (!isFunnelCta(cta)) return new NextResponse(null, { status: 400 });
  const { error } = await serviceDataClient().rpc("record_funnel_cta", { p_cta: cta });
  if (error) console.error("[funnel] could not count", cta, error.message);
  return new NextResponse(null, { status: 204 });
}
