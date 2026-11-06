import { NextRequest, NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase-server";
import { safeRedirect } from "@/lib/auth/safe-redirect";
import { ADMIN_SIGN_IN_PATH } from "@/lib/admin/session-policy";
import { SITE_URL } from "@/lib/site-url";

/**
 * OAuth callback. Supabase redirects here with a one-time `code`, which is
 * exchanged server-side for a session; the cookies are written by the SSR
 * client and the proxy keeps them refreshed from then on.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);

  const code = searchParams.get("code");
  const redirect = safeRedirect(searchParams.get("redirect"));
  const adminSso = redirect === ADMIN_SIGN_IN_PATH;
  const adminSsoError = new URL(`${ADMIN_SIGN_IN_PATH}?status=sso`, SITE_URL);

  // The provider reports refusals here too (e.g. the user cancelled).
  const oauthError = searchParams.get("error_description") ?? searchParams.get("error");

  if (oauthError) {
    if (adminSso) return NextResponse.redirect(adminSsoError);
    return NextResponse.redirect(
      `${origin}/auth/login?error=${encodeURIComponent(oauthError)}`
    );
  }

  if (!code) {
    if (adminSso) return NextResponse.redirect(adminSsoError);
    return NextResponse.redirect(
      `${origin}/auth/login?error=${encodeURIComponent("Sign-in did not complete")}`
    );
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) throw error;

    return NextResponse.redirect(adminSso ? new URL(ADMIN_SIGN_IN_PATH, SITE_URL) : `${origin}${redirect}`);
  } catch (error) {
    if (adminSso) return NextResponse.redirect(adminSsoError);
    // A signup confirmation link opened in another browser (phone mail app):
    // Supabase already confirmed the email before redirecting here, only the
    // PKCE verifier cookie is missing - so the person just needs to sign in.
    if ((error as { code?: string }).code === "pkce_code_verifier_not_found") {
      const t = await getTranslations("auth.signup");
      return NextResponse.redirect(
        `${origin}/auth/login?message=${encodeURIComponent(t("confirmedOtherBrowser"))}&redirect=${encodeURIComponent(redirect)}`
      );
    }
    const message =
      error instanceof Error ? error.message : "Could not complete sign-in";

    return NextResponse.redirect(
      `${origin}/auth/login?error=${encodeURIComponent(message)}`
    );
  }
}
