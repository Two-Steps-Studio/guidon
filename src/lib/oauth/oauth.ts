import "server-only";

import { randomBytes } from "node:crypto";
import { serviceDataClient } from "@/lib/data-client";
import { hasDirectDatabase } from "@/lib/db/pool";
import { generateApiKey, hashApiKey, keyPrefix } from "@/lib/api/api-keys";
import { hashAuthCode, isValidCodeVerifier, newAuthCode, verifierMatches } from "@/lib/auth/mobile-login-core";
import { checkWebhookUrl, guardedRequest } from "@/lib/webhooks/security";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  AUTH_CODE_TTL_MS,
  REFRESH_TOKEN_TTL_MS,
  isMetadataDocumentClientId,
  redirectUriMatches,
  validateMetadataDocument,
  type ClientMetadata,
  type OAuthScope,
} from "./oauth-core";

/**
 * Guidon's OAuth 2.1 authorization server (migration 073). Service role
 * throughout - none of these tables has grants for anyone else; the user is
 * always the verified session's (authorize) or the code's/token's (token
 * endpoint), never taken from input.
 *
 * Access tokens are API keys (api_keys with oauth_grant_id and expires_at),
 * so the API, MCP server, scopes and RLS treat them like any other key.
 */

export interface OAuthClient extends ClientMetadata {
  client_id: string;
  kind: "dcr" | "cimd";
}

export type TokenResponse = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
};

export type TokenError = { error: "invalid_request" | "invalid_grant" | "invalid_client" | "invalid_scope" | "invalid_target"; error_description: string };

const CIMD_REFRESH_MS = 24 * 60 * 60 * 1000;
const CIMD_MAX_BYTES = 64 * 1024;
const CIMD_TIMEOUT_MS = 5000;

const nowIso = () => new Date().toISOString();

function newClientId(): string {
  return `gdc_${randomBytes(18).toString("base64url")}`;
}

function newRefreshToken(): string {
  return `gdr_${randomBytes(32).toString("base64url")}`;
}

export async function registerClient(client: ClientMetadata): Promise<OAuthClient> {
  const row = { client_id: newClientId(), kind: "dcr" as const, ...client };
  const { error } = await serviceDataClient().from("oauth_clients").insert(row);
  if (error) throw new Error(`Could not register the client: ${error.message}`);
  return row;
}

/** Fetches a Client ID Metadata Document - an https URL on the public internet, small JSON, no redirects. */
async function fetchMetadataDocument(clientId: string): Promise<unknown> {
  const check = await checkWebhookUrl(clientId, { allowPrivate: hasDirectDatabase() });
  if (!check.ok) throw new Error(check.reason);
  // guardedRequest re-checks the address when connecting (DNS rebinding) and
  // follows no redirects.
  const response = await guardedRequest(check.url, {
    method: "GET",
    timeoutMs: CIMD_TIMEOUT_MS,
    maxBytes: CIMD_MAX_BYTES + 1,
    allowPrivate: hasDirectDatabase(),
    headers: { Accept: "application/json", "User-Agent": "Guidon-OAuth/1.0" },
  });
  if (response.status < 200 || response.status >= 300) throw new Error(`The client metadata document answered HTTP ${response.status}.`);
  if (response.text.length > CIMD_MAX_BYTES) throw new Error("The client metadata document is too large.");
  return JSON.parse(response.text);
}

/**
 * The client behind a client_id: registered through DCR, or a metadata
 * document URL - fetched, checked and cached for a day. null when unknown
 * or the document is unusable (`reason` says why, for the error page).
 */
export async function getClient(clientId: string): Promise<{ client: OAuthClient | null; reason?: string }> {
  if (!clientId) return { client: null, reason: "client_id is missing." };
  const db = serviceDataClient();
  const { data } = await db
    .from<OAuthClient & { fetched_at: string | null }>("oauth_clients")
    .select("client_id, kind, client_name, redirect_uris, client_uri, logo_uri, fetched_at")
    .eq("client_id", clientId)
    .maybeSingle();

  if (!isMetadataDocumentClientId(clientId)) {
    return data ? { client: data } : { client: null, reason: "This app isn't registered with Guidon." };
  }

  const fresh = data?.fetched_at && Date.now() - Date.parse(data.fetched_at) < CIMD_REFRESH_MS;
  if (data && fresh) return { client: data };

  let document: unknown;
  try {
    document = await fetchMetadataDocument(clientId);
  } catch (error) {
    // A cached copy beats failing outright when the client's site is briefly down.
    if (data) return { client: data };
    return { client: null, reason: error instanceof Error ? error.message : "The client metadata document couldn't be fetched." };
  }
  const checked = validateMetadataDocument(clientId, document);
  if ("error" in checked) return { client: null, reason: checked.error };

  const row = { client_id: clientId, kind: "cimd" as const, ...checked.client, fetched_at: nowIso() };
  if (data) await db.from("oauth_clients").update(row).eq("client_id", clientId);
  else await db.from("oauth_clients").insert(row);
  return { client: row };
}

export function clientAllowsRedirect(client: OAuthClient, redirectUri: string): boolean {
  return client.redirect_uris.some((registered) => redirectUriMatches(registered, redirectUri));
}

/**
 * The person said yes: one grant per person and app (its scopes replaced
 * by the latest consent), and a 5-minute one-time code bound to the
 * redirect URI and the PKCE challenge.
 */
export async function createAuthorizationCode(input: {
  client: OAuthClient;
  userId: string;
  scopes: OAuthScope[];
  resource: string | undefined;
  redirectUri: string;
  codeChallenge: string;
}): Promise<string> {
  const db = serviceDataClient();
  await db.from("oauth_codes").delete().lt("expires_at", nowIso());

  const { data: existing } = await db
    .from<{ id: string }>("oauth_grants")
    .select("id")
    .eq("client_id", input.client.client_id)
    .eq("user_id", input.userId)
    .is("revoked_at", null)
    .maybeSingle();

  let grantId = existing?.id;
  if (grantId) {
    await db
      .from("oauth_grants")
      .update({ scopes: input.scopes, resource: input.resource ?? null, client_name: input.client.client_name })
      .eq("id", grantId);
  } else {
    const { data: created, error } = await db
      .from<{ id: string }>("oauth_grants")
      .insert({
        client_id: input.client.client_id,
        user_id: input.userId,
        client_name: input.client.client_name,
        scopes: input.scopes,
        resource: input.resource ?? null,
      })
      .select("id")
      .single();
    if (error || !created) throw new Error(`Could not save the authorization: ${error?.message}`);
    grantId = created.id;
  }

  const code = newAuthCode();
  const { error } = await db.from("oauth_codes").insert({
    code_hash: hashAuthCode(code),
    grant_id: grantId,
    redirect_uri: input.redirectUri,
    code_challenge: input.codeChallenge,
    expires_at: new Date(Date.now() + AUTH_CODE_TTL_MS).toISOString(),
  });
  if (error) throw new Error(`Could not issue the authorization code: ${error.message}`);
  return code;
}

interface GrantRow {
  id: string;
  client_id: string;
  user_id: string;
  client_name: string;
  scopes: string[];
  resource: string | null;
  revoked_at: string | null;
}

const GRANT_COLUMNS = "id, client_id, user_id, client_name, scopes, resource, revoked_at";

/** A fresh one-hour access token (an API key row) and a rotated refresh token for the grant. */
async function issueTokens(grant: GrantRow, scopes: string[]): Promise<TokenResponse> {
  const db = serviceDataClient();
  // Access tokens of this grant that have run out are of no use to anyone.
  await db.from("api_keys").delete().eq("oauth_grant_id", grant.id).lt("expires_at", nowIso());

  const accessToken = generateApiKey();
  const { error: keyError } = await db.from("api_keys").insert({
    user_id: grant.user_id,
    name: `${grant.client_name} (OAuth)`.slice(0, 100),
    key_prefix: keyPrefix(accessToken),
    key_hash: hashApiKey(accessToken),
    scopes,
    // Shown as "via <app>" on what the token does (migration 036).
    bot_label: grant.client_name.slice(0, 60),
    oauth_grant_id: grant.id,
    expires_at: new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000).toISOString(),
  });
  if (keyError) throw new Error(`Could not issue the access token: ${keyError.message}`);

  const refreshToken = newRefreshToken();
  const { error: refreshError } = await db.from("oauth_refresh_tokens").insert({
    token_hash: hashApiKey(refreshToken),
    grant_id: grant.id,
    expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL_MS).toISOString(),
  });
  if (refreshError) throw new Error(`Could not issue the refresh token: ${refreshError.message}`);

  await db.from("oauth_grants").update({ last_used_at: nowIso() }).eq("id", grant.id);
  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: refreshToken,
    scope: scopes.join(" "),
  };
}

/** authorization_code grant. The code is spent before anything is checked, so a wrong verifier can't be retried. */
export async function exchangeAuthorizationCode(input: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
  resource: string | undefined;
}): Promise<TokenResponse | TokenError> {
  if (!input.code || !input.clientId || !input.redirectUri || !isValidCodeVerifier(input.codeVerifier)) {
    return { error: "invalid_request", error_description: "code, client_id, redirect_uri and a valid code_verifier are required." };
  }
  const db = serviceDataClient();
  const { data: spent } = await db
    .from<{ grant_id: string; redirect_uri: string; code_challenge: string }>("oauth_codes")
    .update({ used_at: nowIso() })
    .eq("code_hash", hashAuthCode(input.code))
    .is("used_at", null)
    .gt("expires_at", nowIso())
    .select("grant_id, redirect_uri, code_challenge");
  const code = spent?.[0];
  if (!code) return { error: "invalid_grant", error_description: "The authorization code is invalid, expired or already used." };

  const { data: grant } = await db.from<GrantRow>("oauth_grants").select(GRANT_COLUMNS).eq("id", code.grant_id).maybeSingle();
  if (!grant || grant.revoked_at) return { error: "invalid_grant", error_description: "The authorization was revoked." };
  if (grant.client_id !== input.clientId) return { error: "invalid_grant", error_description: "The code was issued to another client." };
  if (code.redirect_uri !== input.redirectUri) return { error: "invalid_grant", error_description: "redirect_uri doesn't match the authorization request." };
  if (!verifierMatches(input.codeVerifier, code.code_challenge)) return { error: "invalid_grant", error_description: "PKCE verification failed." };
  if (input.resource && grant.resource && input.resource !== grant.resource) {
    return { error: "invalid_target", error_description: "resource doesn't match the authorization request." };
  }
  return issueTokens(grant, grant.scopes);
}

/**
 * refresh_token grant with rotation. Presenting a refresh token that was
 * already used means it leaked (or the client is confused) - the whole
 * grant is revoked, as OAuth 2.1 recommends for public clients.
 */
export async function refreshAccessToken(input: { refreshToken: string; clientId: string; scope: string[] | null }): Promise<TokenResponse | TokenError> {
  if (!input.refreshToken || !input.clientId) {
    return { error: "invalid_request", error_description: "refresh_token and client_id are required." };
  }
  const db = serviceDataClient();
  const hash = hashApiKey(input.refreshToken);
  const { data: row } = await db
    .from<{ grant_id: string; used_at: string | null; expires_at: string }>("oauth_refresh_tokens")
    .select("grant_id, used_at, expires_at")
    .eq("token_hash", hash)
    .maybeSingle();
  if (!row) return { error: "invalid_grant", error_description: "Unknown refresh token." };

  const { data: grant } = await db.from<GrantRow>("oauth_grants").select(GRANT_COLUMNS).eq("id", row.grant_id).maybeSingle();
  if (!grant || grant.revoked_at) return { error: "invalid_grant", error_description: "The authorization was revoked." };
  if (grant.client_id !== input.clientId) return { error: "invalid_grant", error_description: "The refresh token belongs to another client." };

  if (row.used_at) {
    await revokeGrant(grant.id);
    return { error: "invalid_grant", error_description: "This refresh token was already used; the authorization has been revoked. Sign in again." };
  }
  if (Date.parse(row.expires_at) <= Date.now()) return { error: "invalid_grant", error_description: "The refresh token expired. Sign in again." };

  const { data: claimed } = await db
    .from("oauth_refresh_tokens")
    .update({ used_at: nowIso() })
    .eq("token_hash", hash)
    .is("used_at", null)
    .select("token_hash");
  // Lost a race with a concurrent refresh using the same token.
  if (!claimed || claimed.length !== 1) return { error: "invalid_grant", error_description: "This refresh token was already used." };

  let scopes = grant.scopes;
  if (input.scope) {
    if (input.scope.some((s) => !grant.scopes.includes(s))) {
      return { error: "invalid_scope", error_description: "A refresh can't add scopes the person didn't approve." };
    }
    scopes = input.scope;
  }
  return issueTokens(grant, scopes);
}

/** Ends an authorization: its access tokens stop working at once, its refresh tokens can't be used. */
export async function revokeGrant(grantId: string): Promise<void> {
  const db = serviceDataClient();
  await db.from("oauth_grants").update({ revoked_at: nowIso() }).eq("id", grantId);
  await db.from("api_keys").delete().eq("oauth_grant_id", grantId);
  await db.from("oauth_refresh_tokens").delete().eq("grant_id", grantId);
}

/** RFC 7009: a refresh token ends its grant, an access token just itself. Unknown tokens are fine. */
export async function revokeToken(token: string): Promise<void> {
  if (!token) return;
  const db = serviceDataClient();
  const hash = hashApiKey(token);
  const { data: refresh } = await db.from<{ grant_id: string }>("oauth_refresh_tokens").select("grant_id").eq("token_hash", hash).maybeSingle();
  if (refresh) {
    await revokeGrant(refresh.grant_id);
    return;
  }
  // Only OAuth-issued keys - a personal API key is revoked from the profile, not by anyone holding it.
  const { data: key } = await db
    .from<{ id: string; oauth_grant_id: string | null }>("api_keys")
    .select("id, oauth_grant_id")
    .eq("key_hash", hash)
    .maybeSingle();
  if (key?.oauth_grant_id) await db.from("api_keys").delete().eq("id", key.id);
}

export interface ConnectedApp {
  id: string;
  client_name: string;
  client_id: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
}

/** The profile's "Connected apps". */
export async function listConnectedApps(userId: string): Promise<ConnectedApp[]> {
  const { data } = await serviceDataClient()
    .from<ConnectedApp>("oauth_grants")
    .select("id, client_name, client_id, scopes, created_at, last_used_at")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  return data ?? [];
}

/** Disconnect from the profile - only the person's own grant. */
export async function revokeConnectedApp(userId: string, grantId: string): Promise<boolean> {
  const { data } = await serviceDataClient()
    .from<{ id: string }>("oauth_grants")
    .select("id")
    .eq("id", grantId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return false;
  await revokeGrant(grantId);
  return true;
}
