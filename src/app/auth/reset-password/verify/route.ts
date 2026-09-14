import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

/**
 * Establishes the session from a password-recovery email link. This has to
 * be a Route Handler, not the /auth/reset-password page itself - Next.js
 * only allows cookies().set() (which the Supabase SSR client's session
 * persistence depends on) from a Server Action or Route Handler, not from
 * a page's render; calling verifyOtp() directly in the page verified the
 * token against GoTrue but silently never persisted the resulting session
 * cookie (this codebase's own cookie adapter swallows the write in that
 * context - see supabase-server.ts's createClient()), leaving the
 * reset-password page with no session to act on. Deliberately a separate
 * small route rather than folded into auth/callback/route.ts, which
 * handles a different, already-working flow (OAuth's PKCE code exchange)
 * - keeping this isolated means a bug here can't regress that.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);

  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  if (!tokenHash || type !== "recovery") {
    return NextResponse.redirect(
      `${origin}/auth/login?error=${encodeURIComponent("That reset link is invalid or has expired.")}`
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });

  if (error) {
    return NextResponse.redirect(
      `${origin}/auth/login?error=${encodeURIComponent("That reset link is invalid or has expired.")}`
    );
  }

  return NextResponse.redirect(`${origin}/auth/reset-password`);
}
