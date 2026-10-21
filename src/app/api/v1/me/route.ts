import { NextRequest, NextResponse } from "next/server";
import { apiRoute } from "@/lib/api/api-route";
import { authenticateApiKey } from "@/lib/api/api-key-auth";
import { serviceDataClient } from "@/lib/data-client";
import { bearerChallenge } from "@/lib/oauth/oauth-core";
import { SITE_URL } from "@/lib/site-url";

/**
 * Who the token acts as - for `guidon whoami`, the mobile app's settings and
 * agents checking their credentials. Any valid key or OAuth token, no scope
 * needed: it only says what the caller already holds.
 */
async function handleGET(request: NextRequest) {
  const identity = await authenticateApiKey(request.headers.get("authorization"));
  if (!identity) {
    return NextResponse.json(
      { error: "Invalid or missing API key." },
      { status: 401, headers: { "WWW-Authenticate": bearerChallenge(SITE_URL, "/api/v1") } }
    );
  }
  const { data: profile } = await serviceDataClient()
    .from<{ id: string; email: string; full_name: string | null }>("profiles")
    .select("id, email, full_name")
    .eq("id", identity.userId)
    .maybeSingle();
  return NextResponse.json({
    user: { id: identity.userId, email: profile?.email ?? null, name: profile?.full_name ?? null },
    token: { scopes: identity.scopes, project_id: identity.projectId, human_client: identity.humanClient },
  });
}

export const GET = apiRoute(handleGET);
