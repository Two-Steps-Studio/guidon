import { NextRequest, NextResponse } from "next/server";
import { verifyGithubOAuthState } from "@/lib/github/oauth-state";

/**
 * GitHub App "Setup URL" - hit after a user installs (or updates) the app
 * from the "Install on another account" link in the repo picker
 * (connect-repo/page.tsx builds that link with a signed `state`, same
 * helper the main connect/callback flow uses).
 *
 * No token exchange needed here: the pending cookie from the original
 * /api/github/connect round trip is still valid (10 min TTL), so bouncing
 * back to connect-repo lets the picker just re-list installations with it.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const state = searchParams.get("state");
  const projectId = verifyGithubOAuthState(state);

  if (!projectId) {
    return NextResponse.redirect(
      `${origin}/projects?githubError=${encodeURIComponent("GitHub app installation did not complete.")}`
    );
  }

  return NextResponse.redirect(`${origin}/projects/${projectId}/files/connect-repo`);
}
