import { NextRequest } from "next/server";
import { revokeToken } from "@/lib/oauth/oauth";
import { CORS_HEADERS, clientIdFrom, oauthJson, preflight, readParams } from "@/lib/oauth/http";
import { authenticateOAuthClient } from "@/lib/oauth/client-auth";
import { ipRateLimit, withHeaders } from "@/lib/ip-rate-limit";

/** RFC 7009 token revocation: always 200, whether or not the token existed. */
export async function POST(request: NextRequest) {
  const rate = ipRateLimit("oauth-revoke", request, 60);
  if (rate.limited) return withHeaders(oauthJson({ error: "slow_down" }, 429), rate.headers);
  const params = await readParams(request);
  if (!params || !(await authenticateOAuthClient(clientIdFrom(request, params), params, "revoke"))) {
    return oauthJson({ error: "invalid_client", error_description: "Client authentication failed." }, 401);
  }
  if (params?.token) await revokeToken(params.token);
  return new Response(null, { status: 200, headers: { ...CORS_HEADERS, "Cache-Control": "no-store" } });
}

export const OPTIONS = preflight;
