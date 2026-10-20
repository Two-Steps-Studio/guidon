import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { hasDirectDatabase } from "@/lib/db/pool";
import { safeRedirect } from "@/lib/auth/safe-redirect";
import {
  OAUTH_STATE_TTL_SECONDS,
  codeChallengeFor,
  createCodeVerifier,
  signOAuthState,
} from "@/lib/auth/oauth-local-core";
import { endpointsFor } from "@/lib/auth/oauth-local";
import { OAUTH_COOKIE_PATH, OAUTH_STATE_COOKIE, callbackUrl, findProvider, loginErrorUrl } from "./oauth-route-helpers";

/**
 * Self-hosted "Sign in with <provider>", step 1: send the browser to the
 * provider with a fresh state + PKCE challenge, remembered in a signed,
 * short-lived cookie that the callback checks. Hosted installs sign in
 * through Supabase Auth instead (components/auth/oauth-buttons.tsx).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: id } = await params;
  const provider = hasDirectDatabase() ? findProvider(id) : null;
  if (!provider) return new NextResponse("Not found", { status: 404 });

  const secret = process.env.AUTH_SECRET;
  if (!secret) return NextResponse.redirect(loginErrorUrl(request, "AUTH_SECRET is not set on this server."));

  let authorizeUrl: string;
  try {
    authorizeUrl = (await endpointsFor(provider)).authorizeUrl;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error";
    return NextResponse.redirect(loginErrorUrl(request, `${provider.label} sign-in is unavailable (${reason}).`));
  }

  const state = randomBytes(16).toString("base64url");
  const verifier = createCodeVerifier();
  const target = new URL(authorizeUrl);
  target.search = new URLSearchParams({
    ...Object.fromEntries(target.searchParams),
    response_type: "code",
    client_id: provider.clientId,
    redirect_uri: callbackUrl(request, provider),
    scope: provider.scope,
    state,
    code_challenge: codeChallengeFor(verifier),
    code_challenge_method: "S256",
  }).toString();

  const response = NextResponse.redirect(target);
  response.cookies.set(
    OAUTH_STATE_COOKIE,
    signOAuthState(
      {
        provider: provider.id,
        state,
        verifier,
        redirect: safeRedirect(request.nextUrl.searchParams.get("redirect")),
        exp: Math.floor(Date.now() / 1000) + OAUTH_STATE_TTL_SECONDS,
      },
      secret
    ),
    {
      httpOnly: true,
      // Lax: the provider's redirect back is a top-level GET, which Lax allows.
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: OAUTH_COOKIE_PATH,
      maxAge: OAUTH_STATE_TTL_SECONDS,
    }
  );
  return response;
}
