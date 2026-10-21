import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey, type ApiKeyIdentity } from "./api-key-auth";
import { isRateLimitExempt, isRateLimited, rateLimitStatus, recordRequest } from "./rate-limit";
import { noteRateLimit } from "./api-route";
import type { ApiKeyScope } from "./api-keys";
import { isOriginAllowed } from "./key-origins";
import { bearerChallenge } from "@/lib/oauth/oauth-core";
import { SITE_URL } from "@/lib/site-url";

/**
 * Runs the common checks every /api/v1 AI Task API route needs, in order:
 * valid key -> not rate-limited -> has the required scope. Returns either
 * the authenticated identity or a ready-to-return NextResponse for the
 * caller to `return` immediately - mirrors requireAuth()/isAuthError() in
 * src/lib/auth/auth-helpers.ts, the existing pattern for "check or bail"
 * in this codebase's API routes.
 */
export async function guardApiRequest(
  request: NextRequest,
  requiredScope: ApiKeyScope,
  /**
   * The project this route acts on, when the route knows it up front. A key
   * bound to a project (migration 054) is accepted only by routes that pass
   * it here and only for that project - every other route refuses such keys,
   * so a new route is closed to them until it opts in.
   */
  options: { projectId?: string } = {}
): Promise<ApiKeyIdentity | NextResponse> {
  const identity = await authenticateApiKey(request.headers.get("authorization"));
  if (!identity) {
    return NextResponse.json(
      { error: "Invalid or missing API key." },
      { status: 401, headers: { "WWW-Authenticate": bearerChallenge(SITE_URL, "/api/v1") } }
    );
  }

  if (!isRateLimitExempt() && isRateLimited(identity.apiKeyId)) {
    noteRateLimit(rateLimitStatus(identity.apiKeyId));
    return NextResponse.json({ error: "Rate limit exceeded. Try again shortly." }, { status: 429 });
  }
  if (!isRateLimitExempt()) recordRequest(identity.apiKeyId);
  noteRateLimit(rateLimitStatus(identity.apiKeyId));

  if (!identity.scopes.includes(requiredScope)) {
    return NextResponse.json(
      { error: `This API key does not have the '${requiredScope}' scope.` },
      { status: 403 }
    );
  }

  if (identity.projectId && identity.projectId !== options.projectId) {
    return NextResponse.json(
      { error: "This API key is limited to one project and can't be used here." },
      { status: 403 }
    );
  }

  if (!isOriginAllowed(request.headers.get("origin"), identity.allowedOrigins)) {
    return NextResponse.json({ error: "This API key can't be used from this website." }, { status: 403 });
  }

  return identity;
}

export function isGuardError(result: ApiKeyIdentity | NextResponse): result is NextResponse {
  return result instanceof NextResponse;
}
