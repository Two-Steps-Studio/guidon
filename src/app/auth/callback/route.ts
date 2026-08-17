import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

/**
 * OAuth callback. Supabase redirects here with a one-time `code`, which is
 * exchanged server-side for a session; the cookies are written by the SSR
 * client and the proxy keeps them refreshed from then on.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);

  const code = searchParams.get("code");
  const redirect = safeRedirect(searchParams.get("redirect"));

  // The provider reports refusals here too (e.g. the user cancelled).
  const oauthError = searchParams.get("error_description") ?? searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(
      `${origin}/auth/login?error=${encodeURIComponent(oauthError)}`
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${origin}/auth/login?error=${encodeURIComponent("Sign-in did not complete")}`
    );
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) throw error;

    return NextResponse.redirect(`${origin}${redirect}`);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not complete sign-in";

    return NextResponse.redirect(
      `${origin}/auth/login?error=${encodeURIComponent(message)}`
    );
  }
}

/**
 * Only same-site paths are accepted, so `?redirect=` cannot be used to bounce
 * a freshly authenticated user to another origin.
 */
function safeRedirect(value: string | null): string {
  if (!value) return "/dashboard";
  if (!value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}
