import { NextRequest, NextResponse } from "next/server";
import { serviceDataClient } from "@/lib/data-client";
import { isFunnelCta } from "@/lib/funnel";

/**
 * Counts a click on a landing-page sign-up button (migration 096): adds one
 * to today's total for that button name. No cookie, identifier or IP is
 * stored, so it needs no consent. Sent with navigator.sendBeacon from
 * CtaLink; public route (src/proxy.ts). Service role, because no signed-in
 * role may write the counters.
 */
export async function POST(request: NextRequest) {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > 200) return new NextResponse(null, { status: 413 });
  const cta = (await request.text()).trim();
  if (!isFunnelCta(cta)) return new NextResponse(null, { status: 400 });
  const { error } = await serviceDataClient().rpc("record_funnel_cta", { p_cta: cta });
  if (error) console.error("[funnel] could not count", cta, error.message);
  return new NextResponse(null, { status: 204 });
}
