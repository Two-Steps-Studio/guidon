import { NextRequest, NextResponse } from "next/server";
import { createRateLimitWindow } from "@/lib/ai/rate-limit-window";
import { redeemMobileAuthCode } from "@/lib/auth/mobile-login";
import { isValidCodeVerifier } from "@/lib/auth/mobile-login-core";
import { apiRoute } from "@/lib/api/api-route";

/**
 * POST { code, code_verifier } -> { api_key, email, name }: the second half
 * of the mobile app's sign-in (lib/auth/mobile-login.ts). Unauthenticated by
 * nature - the one-time code and the PKCE verifier are the credentials.
 * Capped per client address so codes can't be guessed in bulk (they're 256
 * random bits anyway).
 */

const perAddress = createRateLimitWindow(20, 10 * 60 * 1000);

async function handlePOST(request: NextRequest) {
  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (perAddress.isLimited(address)) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }
  perAddress.record(address);

  const body = (await request.json().catch(() => null)) as { code?: unknown; code_verifier?: unknown } | null;
  const code = body?.code;
  const verifier = body?.code_verifier;
  if (typeof code !== "string" || code.length > 100 || !isValidCodeVerifier(verifier)) {
    return NextResponse.json({ error: "code and code_verifier are required." }, { status: 400 });
  }

  const result = await redeemMobileAuthCode(code, verifier);
  if (!result) {
    return NextResponse.json({ error: "This sign-in link is invalid, expired or already used. Sign in again." }, { status: 400 });
  }
  return NextResponse.json(
    { api_key: result.apiKey, email: result.email, name: result.name },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export const POST = apiRoute(handlePOST);
