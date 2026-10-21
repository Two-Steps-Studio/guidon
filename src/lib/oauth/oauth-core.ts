// No imports: loaded by tests/oauth.test.mjs with Node's type stripping.

/**
 * OAuth 2.1 authorization server rules (migration 073) as plain functions:
 * redirect URIs, client registration (RFC 7591) and Client ID Metadata
 * Documents, scopes, the RFC 8707 resource, and the responses' shapes.
 * The I/O lives in src/lib/oauth/oauth.ts.
 */

/** What an OAuth client may ask for - the API key scopes minus reports:write (a game's write-only key, not an agent's). */
export const OAUTH_SCOPES = [
  "tasks:read",
  "tasks:write",
  "tasks:status",
  "comments:write",
  "attempts:write",
  "project:read",
  "project:write",
] as const;
export type OAuthScope = (typeof OAUTH_SCOPES)[number];

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
export const REFRESH_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const AUTH_CODE_TTL_MS = 5 * 60 * 1000;
export const MAX_REDIRECT_URIS = 10;
export const MAX_URI_LENGTH = 2000;

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const FORBIDDEN_SCHEMES = new Set(["javascript:", "data:", "file:", "vbscript:", "blob:", "about:"]);

/**
 * A redirect URI a client may register: https, http only on a loopback
 * host (native apps and CLIs listen there), or a native app's own scheme
 * (`cursor://...`, `com.example.app:/cb`). Never a fragment.
 */
export function isAllowedRedirectUri(raw: string): boolean {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_URI_LENGTH) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.hash || raw.includes("#")) return false;
  if (url.username || url.password) return false;
  if (FORBIDDEN_SCHEMES.has(url.protocol)) return false;
  if (url.protocol === "https:") return url.hostname.length > 0;
  if (url.protocol === "http:") return LOOPBACK_HOSTS.has(url.hostname);
  // Private-use scheme: letters, digits, + . - and at least 2 characters.
  return /^[a-z][a-z0-9+.-]+:$/.test(url.protocol);
}

/**
 * Exact string match (RFC 9700), except a loopback http redirect may use
 * any port - native clients pick a free one at run time (RFC 8252 7.3).
 */
export function redirectUriMatches(registered: string, requested: string): boolean {
  if (registered === requested) return true;
  let a: URL;
  let b: URL;
  try {
    a = new URL(registered);
    b = new URL(requested);
  } catch {
    return false;
  }
  if (a.protocol !== "http:" || b.protocol !== "http:") return false;
  if (!LOOPBACK_HOSTS.has(a.hostname) || a.hostname !== b.hostname) return false;
  return a.pathname === b.pathname && a.search === b.search;
}

/** `scope` of a request: space-separated, only known scopes, no duplicates. Empty -> all of them. */
export function parseScopes(scope: string | null | undefined): { scopes: OAuthScope[] } | { error: string } {
  const requested = (scope ?? "").split(" ").map((s) => s.trim()).filter(Boolean);
  // Some clients add these on their own; Guidon issues refresh tokens anyway.
  const meaningful = requested.filter((s) => s !== "offline_access" && s !== "openid");
  if (meaningful.length === 0) return { scopes: [...OAUTH_SCOPES] };
  const unknown = meaningful.filter((s) => !(OAUTH_SCOPES as readonly string[]).includes(s));
  if (unknown.length) return { error: `Unknown scope: ${unknown.join(", ")}.` };
  return { scopes: [...new Set(meaningful)] as OAuthScope[] };
}

/**
 * RFC 8707 resource -> the canonical one Guidon issues tokens for, or null
 * when it isn't this server. Guidon's MCP server and REST API are one
 * resource server (the same keys work on both), so any of them is accepted
 * and stored as asked.
 */
export function normalizeResource(resource: string | null | undefined, siteUrl: string): string | null | undefined {
  if (resource === null || resource === undefined || resource === "") return undefined;
  const site = siteUrl.replace(/\/+$/, "");
  const value = resource.replace(/\/+$/, "");
  const accepted = [site, `${site}/api/mcp`, `${site}/api/v1`];
  return accepted.includes(value) ? value : null;
}

export interface ClientMetadata {
  client_name: string;
  redirect_uris: string[];
  client_uri: string | null;
  logo_uri: string | null;
}

function optionalHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > MAX_URI_LENGTH) return null;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

/**
 * Dynamic Client Registration request (RFC 7591) -> what Guidon registers.
 * Public clients only: whatever auth method is asked for, the answer says
 * `none` (PKCE protects the code instead of a secret).
 */
export function validateRegistration(body: unknown): { client: ClientMetadata } | { error: string; description: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "invalid_client_metadata", description: "Send the client metadata as a JSON object." };
  }
  const input = body as Record<string, unknown>;
  const uris = input.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0) {
    return { error: "invalid_redirect_uri", description: "redirect_uris must list at least one URI." };
  }
  if (uris.length > MAX_REDIRECT_URIS) {
    return { error: "invalid_redirect_uri", description: `At most ${MAX_REDIRECT_URIS} redirect_uris.` };
  }
  for (const uri of uris) {
    if (typeof uri !== "string" || !isAllowedRedirectUri(uri)) {
      return {
        error: "invalid_redirect_uri",
        description: `Not an allowed redirect URI: ${String(uri).slice(0, 200)}. Use https, http on localhost, or an app's own scheme.`,
      };
    }
  }
  const grantTypes = input.grant_types;
  if (grantTypes !== undefined && (!Array.isArray(grantTypes) || !grantTypes.includes("authorization_code"))) {
    return { error: "invalid_client_metadata", description: "Only the authorization_code grant (with refresh_token) is supported." };
  }
  const responseTypes = input.response_types;
  if (responseTypes !== undefined && (!Array.isArray(responseTypes) || responseTypes.some((t) => t !== "code"))) {
    return { error: "invalid_client_metadata", description: "Only response_type code is supported." };
  }
  const name = typeof input.client_name === "string" ? input.client_name.trim().slice(0, 100) : "";
  return {
    client: {
      client_name: name || "An MCP client",
      redirect_uris: [...new Set(uris as string[])],
      client_uri: optionalHttpsUrl(input.client_uri),
      logo_uri: optionalHttpsUrl(input.logo_uri),
    },
  };
}

/** A Client ID Metadata Document client: client_id is an https URL with a path (draft-ietf-oauth-client-id-metadata-document). */
export function isMetadataDocumentClientId(clientId: string): boolean {
  if (clientId.length > MAX_URI_LENGTH) return false;
  try {
    const url = new URL(clientId);
    return url.protocol === "https:" && url.pathname.length > 1 && !url.hash && !url.username && !url.password;
  } catch {
    return false;
  }
}

export type ClientAuthentication =
  | { method: "none" }
  | { method: "private_key_jwt"; jwksUri: string | null; jwks: { keys: Record<string, unknown>[] } | null };

/** Authentication keys come only from the client's HTTPS metadata, never from a JWT header. */
export function validateClientAuthentication(doc: Record<string, unknown>): { auth: ClientAuthentication } | { error: string } {
  const method = doc.token_endpoint_auth_method === undefined ? "none" : doc.token_endpoint_auth_method;
  if (method === "none") return { auth: { method } };
  if (method !== "private_key_jwt") {
    return { error: "Supported client authentication methods are none and private_key_jwt." };
  }
  if (doc.jwks_uri !== undefined && doc.jwks !== undefined) return { error: "Use either jwks_uri or jwks, not both." };
  if (doc.jwks_uri !== undefined) {
    try {
      if (typeof doc.jwks_uri !== "string" || doc.jwks_uri.length > MAX_URI_LENGTH) throw new Error();
      const uri = new URL(doc.jwks_uri);
      if (uri.protocol !== "https:" || uri.username || uri.password || uri.hash) throw new Error();
      return { auth: { method, jwksUri: doc.jwks_uri, jwks: null } };
    } catch {
      return { error: "private_key_jwt requires an HTTPS jwks_uri without credentials or a fragment." };
    }
  }
  const jwks = doc.jwks as { keys?: unknown } | null;
  if (!jwks || !Array.isArray(jwks.keys) || jwks.keys.length === 0 || jwks.keys.length > 100 ||
      jwks.keys.some((key) => !key || typeof key !== "object" || Array.isArray(key) ||
        !["RSA", "EC", "OKP"].includes(key.kty) ||
        ["d", "p", "q", "dp", "dq", "qi", "oth", "k"].some((field) => field in key))) {
    return { error: "private_key_jwt requires jwks_uri or a public JSON Web Key Set." };
  }
  return { auth: { method, jwksUri: null, jwks: { keys: jwks.keys } } };
}

/** The fetched metadata document must name itself and carry valid redirect URIs and authentication keys. */
export function validateMetadataDocument(clientId: string, document: unknown): { client: ClientMetadata } | { error: string } {
  if (!document || typeof document !== "object") return { error: "The client metadata document isn't a JSON object." };
  const doc = document as Record<string, unknown>;
  if (doc.client_id !== clientId) return { error: "The client metadata document's client_id doesn't match its URL." };
  const authentication = validateClientAuthentication(doc);
  if ("error" in authentication) return authentication;
  const registered = validateRegistration(doc);
  if ("error" in registered) return { error: registered.description };
  // Without a name, show where the client comes from.
  const client = registered.client;
  if (client.client_name === "An MCP client") client.client_name = new URL(clientId).hostname;
  return { client };
}

/** `redirect_uri` + query parameters, keeping any query the URI already has. */
export function withQuery(uri: string, params: Record<string, string | undefined>): string {
  const url = new URL(uri);
  for (const [key, value] of Object.entries(params)) if (value !== undefined) url.searchParams.set(key, value);
  return url.toString();
}

/** People-readable lines for the consent screen. */
export const SCOPE_DESCRIPTIONS: Readonly<Record<OAuthScope, string>> = {
  "tasks:read": "See your projects, tasks, comments and attempts",
  "tasks:write": "Create, edit and delete tasks",
  "tasks:status": "Start tasks and move them between columns",
  "comments:write": "Comment on tasks",
  "attempts:write": "Record what was tried on a task",
  "project:read": "Read decisions, knowledge, roadmap, memory and tech stack",
  "project:write": "Change decisions, knowledge, roadmap, memory and tech stack",
};

/** RFC 8414 authorization server metadata. */
export function authorizationServerMetadata(siteUrl: string) {
  return {
    issuer: siteUrl,
    authorization_endpoint: `${siteUrl}/oauth/authorize`,
    token_endpoint: `${siteUrl}/oauth/token`,
    registration_endpoint: `${siteUrl}/oauth/register`,
    revocation_endpoint: `${siteUrl}/oauth/revoke`,
    scopes_supported: [...OAUTH_SCOPES],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "private_key_jwt"],
    revocation_endpoint_auth_methods_supported: ["none", "private_key_jwt"],
    token_endpoint_auth_signing_alg_values_supported: ["RS256", "PS256", "ES256", "ES384", "EdDSA"],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
    service_documentation: `${siteUrl}/auth.md`,
    op_policy_uri: `${siteUrl}/legal/privacy`,
    op_tos_uri: `${siteUrl}/legal/terms`,
  };
}

/** RFC 9728 protected resource metadata for one of Guidon's API surfaces. */
export function protectedResourceMetadata(siteUrl: string, resource: string) {
  return {
    resource,
    authorization_servers: [siteUrl],
    scopes_supported: [...OAUTH_SCOPES],
    bearer_methods_supported: ["header"],
    resource_name: "Guidon",
    resource_documentation: `${siteUrl}/developers`,
    resource_policy_uri: `${siteUrl}/legal/privacy`,
    resource_tos_uri: `${siteUrl}/legal/terms`,
  };
}

/** Where the protected-resource metadata of a resource path lives (RFC 9728 3.1: inserted before the path). */
export function resourceMetadataUrl(siteUrl: string, path: "/api/mcp" | "/api/v1"): string {
  return `${siteUrl}/.well-known/oauth-protected-resource${path}`;
}

/** The 401 challenge pointing agents at the metadata (RFC 9728 5.1). */
export function bearerChallenge(siteUrl: string, path: "/api/mcp" | "/api/v1"): string {
  return `Bearer resource_metadata="${resourceMetadataUrl(siteUrl, path)}"`;
}

/**
 * /auth.md: how an agent gets credentials for Guidon, as Markdown
 * (github.com/workos/auth.md's sections). Guidon has no agent identity
 * assertions, so there is no agent_auth block - only standard OAuth 2.1
 * and personal API keys.
 */
export function authMarkdown(siteUrl: string): string {
  const scopes = OAUTH_SCOPES.map((scope) => `| \`${scope}\` | ${SCOPE_DESCRIPTIONS[scope]} |`).join("\n");
  return `# Authenticating to Guidon

Guidon's MCP server (\`${siteUrl}/api/mcp\`) and REST API (\`${siteUrl}/api/v1\`) accept a bearer token: \`Authorization: Bearer <token>\`. There are two ways to get one. Both act as a Guidon user - only in the projects that user can access, with their role, limited to the token's scopes.

1. **OAuth 2.1** (for MCP clients and apps acting for someone): the user approves your app in their browser; you get a one-hour access token and a refresh token. Claude, ChatGPT, Cursor, VS Code and other MCP clients do this on their own once given \`${siteUrl}/api/mcp\`.
2. **A personal API key** (for scripts, CI and the user's own agents): the user creates one in [Profile → API keys](${siteUrl}/profile) and gives it to you. It doesn't expire until revoked.

## Discover

Call the API without a token. The \`401\` carries the protected resource metadata (RFC 9728):

\`\`\`
WWW-Authenticate: Bearer resource_metadata="${siteUrl}/.well-known/oauth-protected-resource/api/mcp"
\`\`\`

That document names the authorization server (\`authorization_servers: ["${siteUrl}"]\`); its metadata (RFC 8414) is at [${siteUrl}/.well-known/oauth-authorization-server](${siteUrl}/.well-known/oauth-authorization-server).

## Pick a method

- Acting for a person through a client they use (an MCP client, an assistant): **OAuth 2.1 authorization code with PKCE**.
- Running unattended for the user who set you up: **their API key**. There is no client-credentials grant and no anonymous access - every token belongs to a person.

## Register

PKCE protects every authorization code. Dynamic registration creates public clients with no secret.
Client ID Metadata Documents also support signed client authentication (\`private_key_jwt\`).

- **Client ID Metadata Document** (preferred): use an https URL that serves your client metadata as your \`client_id\` (\`client_id_metadata_document_supported: true\`). It must contain \`client_id\` (that same URL), \`client_name\` and \`redirect_uris\`.
- **Dynamic Client Registration** (RFC 7591): \`POST ${siteUrl}/oauth/register\` with JSON \`{ "client_name": "...", "redirect_uris": ["https://..."] }\` -> \`201\` with your \`client_id\`.

For \`private_key_jwt\`, the metadata must include \`jwks_uri\` (HTTPS) or a public \`jwks\`.
Send \`client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer\` and a signed
\`client_assertion\` to the token and revocation endpoints. Its \`iss\` and \`sub\` must match
\`client_id\`, its \`aud\` must identify this issuer or the endpoint, and it needs \`iat\`,
\`exp\` (at most five minutes after \`iat\`) and a unique \`jti\`. Replays are rejected.

Redirect URIs: \`https://\`, \`http://localhost\` / \`127.0.0.1\` (any port at run time), or your app's own scheme.

## Authorize

Send the user's browser to:

\`\`\`
${siteUrl}/oauth/authorize?response_type=code&client_id=...&redirect_uri=...
  &code_challenge=<BASE64URL(SHA256(verifier))>&code_challenge_method=S256
  &scope=tasks:read%20tasks:write&state=...&resource=${siteUrl}/api/mcp
\`\`\`

They sign in to Guidon (if needed) and approve. You get \`code\`, \`state\` and \`iss\` (always \`${siteUrl}\`) on the redirect URI. Codes last 5 minutes and work once.

## Exchange

\`\`\`
POST ${siteUrl}/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&code=...&redirect_uri=...&client_id=...&code_verifier=...&resource=${siteUrl}/api/mcp
\`\`\`

The answer: \`{ "access_token": "guidon_...", "token_type": "Bearer", "expires_in": 3600, "refresh_token": "gdr_...", "scope": "..." }\`.

Refresh before or after the hour with \`grant_type=refresh_token&refresh_token=...&client_id=...\`. Refresh tokens rotate - every refresh returns a new one and the old one stops working; presenting a used one revokes the whole authorization. They last 90 days.

## Use the access_token

\`Authorization: Bearer <access_token>\` on \`${siteUrl}/api/mcp\` (MCP Streamable HTTP) or \`${siteUrl}/api/v1/...\` (REST, see [OpenAPI](${siteUrl}/openapi.json)). Never in a query string.

| Scope | Allows |
|---|---|
${scopes}

Leaving \`scope\` out asks for all of them.

## Errors

| Where | Error | Meaning |
|---|---|---|
| API / MCP | \`401\` + \`WWW-Authenticate\` | No token, expired or revoked - refresh, or start over at Discover |
| API / MCP | \`403\` \`forbidden\` | The token lacks the scope, or the user lacks the permission |
| /oauth/authorize | \`access_denied\` | The user said no |
| /oauth/authorize | \`invalid_request\` | PKCE missing (\`code_challenge\` + \`S256\` are required) |
| /oauth/authorize | \`invalid_scope\` / \`invalid_target\` | Unknown scope / \`resource\` isn't this server |
| /oauth/token | \`invalid_grant\` | Code or refresh token invalid, expired, used, or the user disconnected the app |
| /oauth/register | \`invalid_redirect_uri\` | A redirect URI that isn't https, loopback http or an app scheme |

## Revocation

- You: \`POST ${siteUrl}/oauth/revoke\` with \`token=<refresh or access token>\` (RFC 7009). A refresh token ends the whole authorization.
- The user: Profile → Connected apps → Disconnect, at any time. Access tokens stop working immediately.
- API keys: revoked by the user in Profile → API keys.
`;
}

/** /auth/llms.txt - the authentication section's own index (llmstxt.org format), linked from /llms.txt. */
export function authLlmsTxt(siteUrl: string): string {
  return `# Guidon authentication

> How people and agents sign in to Guidon: OAuth 2.1 with PKCE for MCP clients and apps, personal API keys for scripts, and the browser sign-in for people.

## Docs

- [auth.md](${siteUrl}/auth.md): the whole flow for agents - discover, register, authorize, exchange, use, errors, revocation
- [Authorization server metadata](${siteUrl}/.well-known/oauth-authorization-server): RFC 8414
- [Protected resource metadata for the MCP server](${siteUrl}/.well-known/oauth-protected-resource/api/mcp): RFC 9728
- [Protected resource metadata for the REST API](${siteUrl}/.well-known/oauth-protected-resource/api/v1): RFC 9728
- [Developer guide - Authentication](${siteUrl}/developers.md): API keys and their scopes

## Pages

- [Sign in](${siteUrl}/auth/login.md): for people; agents use OAuth or an API key instead
- [Create an account](${siteUrl}/auth/signup.md)

## Optional

- [Site-wide guide for agents](${siteUrl}/llms.txt)
`;
}
