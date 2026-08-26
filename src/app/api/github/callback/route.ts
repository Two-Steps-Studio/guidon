import { NextRequest, NextResponse } from "next/server";
import { verifyGithubOAuthState } from "@/lib/github/oauth-state";
import { getAuthenticatedUser } from "@/lib/github/client";
import { setPendingGithubConnection } from "@/lib/github/pending-connection";

/**
 * Callback for the "connect a GitHub repo" flow (src/app/api/github/connect).
 * Exchanges the code for an access token, stashes it in a short-lived signed
 * cookie, and sends the user to the repo picker - the token is not written to
 * github_connections until they actually choose a repository there.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error_description") ?? searchParams.get("error");

  const projectId = verifyGithubOAuthState(state);

  const failure = (message: string) => {
    const redirectPath = projectId ? `/projects/${projectId}/files` : "/projects";
    return NextResponse.redirect(`${origin}${redirectPath}?githubError=${encodeURIComponent(message)}`);
  };

  if (oauthError) return failure(oauthError);
  if (!code || !projectId) return failure("GitHub sign-in did not complete.");

  const clientId = process.env.GITHUB_APP_CLIENT_ID;
  const clientSecret = process.env.GITHUB_APP_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return failure("GitHub integration is not configured on this server.");
  }

  try {
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: `${origin}/api/github/callback`,
      }),
    });

    const tokenData = (await tokenResponse.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      refresh_token_expires_in?: number;
      error?: string;
      error_description?: string;
    };

    if (!tokenResponse.ok || !tokenData.access_token || !tokenData.refresh_token) {
      throw new Error(tokenData.error_description ?? tokenData.error ?? "Token exchange failed");
    }

    const githubUser = await getAuthenticatedUser(tokenData.access_token);
    const now = Date.now();

    await setPendingGithubConnection({
      projectId,
      githubLogin: githubUser.login,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      accessTokenExpiresAt: new Date(now + (tokenData.expires_in ?? 0) * 1000),
      refreshTokenExpiresAt: new Date(now + (tokenData.refresh_token_expires_in ?? 0) * 1000),
    });

    return NextResponse.redirect(`${origin}/projects/${projectId}/files/connect-repo`);
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Could not connect to GitHub.");
  }
}
