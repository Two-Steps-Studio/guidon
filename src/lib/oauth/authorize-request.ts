import "server-only";

import { isValidCodeChallenge } from "@/lib/auth/mobile-login-core";
import { SITE_URL } from "@/lib/site-url";
import { clientAllowsRedirect, getClient, type OAuthClient } from "./oauth";
import { normalizeResource, parseScopes, withQuery, type OAuthScope } from "./oauth-core";

export interface AuthorizeParams {
  client_id?: string;
  redirect_uri?: string;
  response_type?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  scope?: string;
  state?: string;
  resource?: string;
}

export type AuthorizeCheck =
  /** Can't trust the redirect URI - show the error, never redirect. */
  | { kind: "fatal"; reason: string }
  /** The client is real and the URI registered - tell the client what's wrong. */
  | { kind: "redirect"; url: string }
  | {
      kind: "ok";
      client: OAuthClient;
      redirectUri: string;
      scopes: OAuthScope[];
      resource: string | undefined;
      codeChallenge: string;
      state: string | undefined;
    };

/**
 * Checks an authorization request in the order RFC 6749 4.1.2.1 demands:
 * client and redirect URI first (an error there must not redirect
 * anywhere), then everything else as an error sent back to the client.
 * Used by the consent page and again by its Allow action.
 */
export async function checkAuthorizeRequest(params: AuthorizeParams): Promise<AuthorizeCheck> {
  const { client, reason } = await getClient(params.client_id ?? "");
  if (!client) return { kind: "fatal", reason: reason ?? "Unknown app." };

  const redirectUri = params.redirect_uri || (client.redirect_uris.length === 1 ? client.redirect_uris[0] : "");
  if (!redirectUri || !clientAllowsRedirect(client, redirectUri)) {
    return { kind: "fatal", reason: "The redirect_uri isn't one this app registered." };
  }

  const state = params.state && params.state.length <= 1000 ? params.state : undefined;
  const fail = (error: string, description: string): AuthorizeCheck => ({
    kind: "redirect",
    url: withQuery(redirectUri, { error, error_description: description, state, iss: SITE_URL }),
  });

  if (params.response_type !== "code") return fail("unsupported_response_type", "Only response_type=code is supported.");
  if (params.code_challenge_method !== "S256" || !isValidCodeChallenge(params.code_challenge)) {
    return fail("invalid_request", "PKCE is required: code_challenge with code_challenge_method=S256.");
  }
  const scopes = parseScopes(params.scope);
  if ("error" in scopes) return fail("invalid_scope", scopes.error);
  const resource = normalizeResource(params.resource, SITE_URL);
  if (resource === null) return fail("invalid_target", "resource must be this Guidon server's MCP or API URL.");

  return {
    kind: "ok",
    client,
    redirectUri,
    scopes: scopes.scopes,
    resource,
    codeChallenge: params.code_challenge as string,
    state,
  };
}
