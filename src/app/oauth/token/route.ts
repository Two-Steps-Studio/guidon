import { NextRequest } from "next/server";
import { exchangeAuthorizationCode, refreshAccessToken } from "@/lib/oauth/oauth";
import { normalizeResource, parseScopes } from "@/lib/oauth/oauth-core";
import { clientIdFrom, oauthJson, preflight, readParams } from "@/lib/oauth/http";
import { SITE_URL } from "@/lib/site-url";
import { authenticateOAuthClient } from "@/lib/oauth/client-auth";

/** OAuth 2.1 token endpoint: authorization_code (with PKCE) and refresh_token. Errors per RFC 6749 5.2. */
export async function POST(request: NextRequest) {
  const params = await readParams(request);
  if (!params) return oauthJson({ error: "invalid_request", error_description: "Send the parameters form-encoded." }, 400);

  const clientId = clientIdFrom(request, params);
  const resource = normalizeResource(params.resource, SITE_URL);
  if (resource === null) {
    return oauthJson({ error: "invalid_target", error_description: "resource must be this Guidon server's MCP or API URL." }, 400);
  }

  try {
    if (!(await authenticateOAuthClient(clientId, params, "token"))) {
      return oauthJson({ error: "invalid_client", error_description: "Client authentication failed." }, 401);
    }
    let result;
    if (params.grant_type === "authorization_code") {
      result = await exchangeAuthorizationCode({
        code: params.code ?? "",
        clientId,
        redirectUri: params.redirect_uri ?? "",
        codeVerifier: params.code_verifier ?? "",
        resource,
      });
    } else if (params.grant_type === "refresh_token") {
      let scope: string[] | null = null;
      if (params.scope) {
        const parsed = parseScopes(params.scope);
        if ("error" in parsed) return oauthJson({ error: "invalid_scope", error_description: parsed.error }, 400);
        scope = parsed.scopes;
      }
      result = await refreshAccessToken({ refreshToken: params.refresh_token ?? "", clientId, scope });
    } else {
      return oauthJson({ error: "unsupported_grant_type", error_description: "Use authorization_code or refresh_token." }, 400);
    }
    if ("error" in result) return oauthJson(result, result.error === "invalid_client" ? 401 : 400);
    return oauthJson(result);
  } catch (error) {
    console.error("[oauth/token]", error);
    return oauthJson({ error: "server_error", error_description: "Something went wrong. Try again." }, 500);
  }
}

export const OPTIONS = preflight;
