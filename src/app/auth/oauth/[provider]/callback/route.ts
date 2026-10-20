import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { hasDirectDatabase } from "@/lib/db/pool";
import { createLocalSession } from "@/lib/auth/local-auth";
import { verifyOAuthState } from "@/lib/auth/oauth-local-core";
import { fetchProfile, findOrCreateOAuthUser } from "@/lib/auth/oauth-local";
import {
  OAUTH_COOKIE_PATH,
  OAUTH_STATE_COOKIE,
  appOrigin,
  callbackUrl,
  findProvider,
  loginErrorUrl,
} from "../oauth-route-helpers";

/**
 * Step 2: the provider sends the browser back with a code. Checked against
 * the state cookie from step 1, exchanged for the user's profile, and turned
 * into a normal local session - the same cookie a password login sets.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: id } = await params;
  const provider = hasDirectDatabase() ? findProvider(id) : null;
  if (!provider) return new NextResponse("Not found", { status: 404 });

  const fail = (message: string) => {
    const response = NextResponse.redirect(loginErrorUrl(request, message));
    response.cookies.set(OAUTH_STATE_COOKIE, "", { path: OAUTH_COOKIE_PATH, maxAge: 0 });
    return response;
  };

  const query = request.nextUrl.searchParams;
  // The provider reports refusals here too (e.g. the user pressed Cancel).
  const refused = query.get("error_description") ?? query.get("error");
  if (refused) return fail(`${provider.label}: ${refused}`);

  const saved = verifyOAuthState(request.cookies.get(OAUTH_STATE_COOKIE)?.value, process.env.AUTH_SECRET ?? "");
  const code = query.get("code");
  if (!saved || saved.provider !== provider.id || !code || query.get("state") !== saved.state) {
    return fail("Sign-in expired or was started in another browser. Please try again.");
  }

  try {
    const profile = await fetchProfile(provider, code, saved.verifier, callbackUrl(request, provider));
    const account = await findOrCreateOAuthUser(profile, provider.id);
    if ("error" in account) return fail(account.error);

    await createLocalSession(account.userId);
    // Through the same cookie store as the session: cookies set on the
    // returned response would be replaced by the store's.
    (await cookies()).set(OAUTH_STATE_COOKIE, "", { path: OAUTH_COOKIE_PATH, maxAge: 0 });
    return NextResponse.redirect(new URL(saved.redirect, appOrigin(request)));
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error";
    return fail(`Could not sign in with ${provider.label} (${reason}).`);
  }
}
