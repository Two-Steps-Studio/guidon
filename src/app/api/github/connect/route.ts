import { NextRequest, NextResponse } from "next/server";
import { getProjectAccess, canManageProject } from "@/lib/data/project-access";
import { createGithubOAuthState } from "@/lib/github/oauth-state";

/**
 * Starts the "connect a GitHub repo to this project" OAuth flow. Distinct
 * from Guidon's login OAuth (src/app/auth/*): this authorizes an
 * already-signed-in Guidon user's GitHub account for `repo` scope, and the
 * resulting token is stored against the project, not used to sign anyone in.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const projectId = searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
  }

  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(
      `${origin}/projects/${projectId}/files?githubError=${encodeURIComponent(
        "GitHub integration is not configured on this server (GITHUB_CLIENT_ID/GITHUB_CLIENT_SECRET)."
      )}`
    );
  }

  const access = await getProjectAccess(projectId);
  if (!access || !canManageProject(access.role)) {
    return NextResponse.redirect(
      `${origin}/projects/${projectId}/files?githubError=${encodeURIComponent(
        "You do not have permission to connect a GitHub repository."
      )}`
    );
  }

  const state = createGithubOAuthState(projectId);
  const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", `${origin}/api/github/callback`);
  authorizeUrl.searchParams.set("scope", "repo");
  authorizeUrl.searchParams.set("state", state);

  return NextResponse.redirect(authorizeUrl.toString());
}
