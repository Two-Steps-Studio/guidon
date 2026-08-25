import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey, type ApiKeyIdentity } from "./api-key-auth";
import { isRateLimited, recordRequest } from "./rate-limit";
import type { ApiKeyScope } from "./api-keys";

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
  requiredScope: ApiKeyScope
): Promise<ApiKeyIdentity | NextResponse> {
  const identity = await authenticateApiKey(request.headers.get("authorization"));
  if (!identity) {
    return NextResponse.json({ error: "Invalid or missing API key." }, { status: 401 });
  }

  if (isRateLimited(identity.apiKeyId)) {
    return NextResponse.json({ error: "Rate limit exceeded. Try again shortly." }, { status: 429 });
  }
  recordRequest(identity.apiKeyId);

  if (!identity.scopes.includes(requiredScope)) {
    return NextResponse.json(
      { error: `This API key does not have the '${requiredScope}' scope.` },
      { status: 403 }
    );
  }

  return identity;
}

export function isGuardError(result: ApiKeyIdentity | NextResponse): result is NextResponse {
  return result instanceof NextResponse;
}
