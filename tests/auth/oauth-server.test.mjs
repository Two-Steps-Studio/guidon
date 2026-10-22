/**
 * Guidon as an OAuth 2.1 authorization server for MCP clients
 * (src/lib/oauth/oauth-core.ts, migration 073): redirect URIs, client
 * registration and metadata documents, scopes, resource, metadata.
 * oauth-core.ts has no imports, so Node's type stripping runs it.
 */
import {
  OAUTH_SCOPES,
  authMarkdown,
  authorizationResponseUrl,
  authorizationServerMetadata,
  bearerChallenge,
  isAllowedRedirectUri,
  isMetadataDocumentClientId,
  normalizeResource,
  normalizeSiteUrl,
  parseScopes,
  protectedResourceMetadata,
  redirectUriMatches,
  validateMetadataDocument,
  validateRegistration,
  withQuery,
} from "../../src/lib/oauth/oauth-core.ts";

let pass = 0;
let fail = 0;
function check(label, ok, detail = "") {
  if (ok) {
    pass++;
    console.log(`    pass  ${label}`);
  } else {
    fail++;
    console.log(`    FAIL  ${label}${detail ? `  -> ${detail}` : ""}`);
  }
}
function section(title) {
  console.log(`\n  ${title}`);
}

const SITE = "https://useguidon.com";

section("redirect URIs a client may register");
check("https", isAllowedRedirectUri("https://claude.ai/api/mcp/auth_callback"));
check("ChatGPT's", isAllowedRedirectUri("https://chatgpt.com/connector_platform_oauth_redirect"));
check("loopback http", isAllowedRedirectUri("http://127.0.0.1:33418/callback") && isAllowedRedirectUri("http://localhost/callback"));
check("IPv6 loopback", isAllowedRedirectUri("http://[::1]:8080/cb"));
check("app scheme", isAllowedRedirectUri("cursor://anysphere.cursor-retrieval/oauth/callback") && isAllowedRedirectUri("com.example.app:/oauth"));
check("not plain http elsewhere", !isAllowedRedirectUri("http://evil.example/cb"));
check("not javascript:", !isAllowedRedirectUri("javascript:alert(1)"));
check("not data:", !isAllowedRedirectUri("data:text/html,hi"));
check("not with a fragment", !isAllowedRedirectUri("https://app.example/cb#x"));
check("not with credentials", !isAllowedRedirectUri("https://user:pw@app.example/cb"));
check("not garbage", !isAllowedRedirectUri("not a url"));

section("redirect URI matching");
check("exact match", redirectUriMatches("https://a.example/cb", "https://a.example/cb"));
check("https must be exact", !redirectUriMatches("https://a.example/cb", "https://a.example/cb2"));
check("loopback: any port", redirectUriMatches("http://127.0.0.1/callback", "http://127.0.0.1:51234/callback"));
check("loopback: not another path", !redirectUriMatches("http://127.0.0.1/callback", "http://127.0.0.1:51234/other"));
check("loopback: not another host", !redirectUriMatches("http://localhost/callback", "http://127.0.0.1/callback"));
check("no prefix matching", !redirectUriMatches("https://a.example/cb", "https://a.example/cb/../evil"));

section("scopes");
const all = parseScopes("");
check("no scope -> all OAuth scopes", "scopes" in all && all.scopes.length === OAUTH_SCOPES.length);
check("offline_access ignored", "scopes" in parseScopes("offline_access") && parseScopes("offline_access").scopes.length === OAUTH_SCOPES.length);
const two = parseScopes("tasks:read  tasks:write tasks:read");
check("two scopes, deduplicated", "scopes" in two && two.scopes.join(" ") === "tasks:read tasks:write");
check("unknown scope rejected", "error" in parseScopes("tasks:read admin"));
check("reports:write not grantable over OAuth", "error" in parseScopes("reports:write"));

section("resource (RFC 8707)");
check("MCP URL accepted", normalizeResource(`${SITE}/api/mcp`, SITE) === `${SITE}/api/mcp`);
check("trailing slash normalised", normalizeResource(`${SITE}/api/mcp/`, SITE) === `${SITE}/api/mcp`);
check("REST API and site accepted", normalizeResource(`${SITE}/api/v1`, SITE) === `${SITE}/api/v1` && normalizeResource(SITE, SITE) === SITE);
check("another server rejected", normalizeResource("https://evil.example/api/mcp", SITE) === null);
check("absent -> undefined", normalizeResource(undefined, SITE) === undefined && normalizeResource("", SITE) === undefined);

section("dynamic client registration (RFC 7591)");
const reg = validateRegistration({ client_name: "Claude", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"], token_endpoint_auth_method: "client_secret_basic" });
check("valid registration", "client" in reg && reg.client.client_name === "Claude");
check("missing redirect_uris", "error" in validateRegistration({ client_name: "x" }) && validateRegistration({}).error === "invalid_redirect_uri");
check("bad redirect URI", "error" in validateRegistration({ redirect_uris: ["http://evil.example/cb"] }));
check("too many redirect URIs", "error" in validateRegistration({ redirect_uris: Array.from({ length: 11 }, (_, i) => `https://a.example/${i}`) }));
check("implicit grant refused", "error" in validateRegistration({ redirect_uris: ["https://a.example/cb"], response_types: ["token"] }));
check("client_credentials-only refused", "error" in validateRegistration({ redirect_uris: ["https://a.example/cb"], grant_types: ["client_credentials"] }));
const unnamed = validateRegistration({ redirect_uris: ["https://a.example/cb"], client_uri: "javascript:x", logo_uri: "https://a.example/logo.png" });
check("unnamed client gets a placeholder; only https client/logo URIs kept", "client" in unnamed && unnamed.client.client_name === "An MCP client" && unnamed.client.client_uri === null && unnamed.client.logo_uri === "https://a.example/logo.png");
check("name capped at 100", "client" in validateRegistration({ client_name: "x".repeat(300), redirect_uris: ["https://a.example/cb"] }) && validateRegistration({ client_name: "x".repeat(300), redirect_uris: ["https://a.example/cb"] }).client.client_name.length === 100);

section("client ID metadata documents");
const cid = "https://chatgpt.com/oauth/client.json";
check("https URL with a path is a CIMD client_id", isMetadataDocumentClientId(cid));
check("random id is not", !isMetadataDocumentClientId("gdc_abc"));
check("bare origin is not", !isMetadataDocumentClientId("https://chatgpt.com/"));
check("http is not", !isMetadataDocumentClientId("http://chatgpt.com/oauth/client.json"));
const doc = validateMetadataDocument(cid, { client_id: cid, client_name: "ChatGPT", redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect"], token_endpoint_auth_method: "none" });
check("valid document", "client" in doc && doc.client.client_name === "ChatGPT");
check("document naming another client_id rejected", "error" in validateMetadataDocument(cid, { client_id: "https://evil.example/c.json", redirect_uris: ["https://a.example/cb"] }));
check("confidential client rejected", "error" in validateMetadataDocument(cid, { client_id: cid, redirect_uris: ["https://a.example/cb"], token_endpoint_auth_method: "private_key_jwt" }));
const nameless = validateMetadataDocument(cid, { client_id: cid, redirect_uris: ["https://a.example/cb"] });
check("nameless document shows its host", "client" in nameless && nameless.client.client_name === "chatgpt.com");

section("metadata documents and challenge");
const canonicalSite = normalizeSiteUrl("https://useguidon.com/");
check("canonical issuer removes trailing slash", canonicalSite === SITE);
check("canonical issuer ignores uppercase host and default port", normalizeSiteUrl("HTTPS://USEGUIDON.COM:443") === SITE);
check("APP_URL rejects a path that would split issuer and endpoint URLs", (() => { try { normalizeSiteUrl("https://useguidon.com/guidon"); return false; } catch { return true; } })());
const as = authorizationServerMetadata(canonicalSite);
check("issuer is the site", as.issuer === SITE);
check("S256 advertised (clients refuse without it)", as.code_challenge_methods_supported.includes("S256"));
check("public clients + CIMD advertised (Claude uses CIMD only with both)", as.token_endpoint_auth_methods_supported.includes("none") && as.client_id_metadata_document_supported === true);
check("iss parameter advertised", as.authorization_response_iss_parameter_supported === true);
check("endpoints under the issuer", [as.authorization_endpoint, as.token_endpoint, as.registration_endpoint, as.revocation_endpoint].every((u) => u.startsWith(`${SITE}/oauth/`)));
check("authorization success response uses the exact discovered issuer", new URL(authorizationResponseUrl("https://client.example/cb", { code: "c", state: "s" }, as.issuer)).searchParams.get("iss") === as.issuer);
check("authorization error response uses the exact discovered issuer", new URL(authorizationResponseUrl("https://client.example/cb", { error: "access_denied" }, as.issuer)).searchParams.get("iss") === as.issuer);
const wrongIssuerResponse = new URL(authorizationResponseUrl("https://client.example/cb", { code: "c" }, "https://www.useguidon.com")).searchParams.get("iss");
check("a callback from a different issuer fails exact issuer matching", wrongIssuerResponse !== as.issuer);
check("existing callback iss is replaced with the configured issuer", new URL(authorizationResponseUrl("https://client.example/cb?iss=https%3A%2F%2Fevil.example", { code: "c" }, as.issuer)).searchParams.get("iss") === as.issuer);
const prm = protectedResourceMetadata(SITE, `${SITE}/api/mcp`);
check("PRM names the resource and the AS", prm.resource === `${SITE}/api/mcp` && prm.authorization_servers[0] === as.issuer);
check("PRM: header bearer only", prm.bearer_methods_supported.join() === "header");
check(
  "401 challenge points at the path-inserted PRM",
  bearerChallenge(SITE, "/api/mcp") === `Bearer resource_metadata="${SITE}/.well-known/oauth-protected-resource/api/mcp"`
);
check("withQuery keeps an existing query", withQuery("https://a.example/cb?x=1", { code: "c", state: undefined }) === "https://a.example/cb?x=1&code=c");

section("/auth.md");
const md = authMarkdown(SITE);
check("starts with a top-level heading", md.startsWith("# "));
for (const heading of ["Discover", "Pick a method", "Register", "Exchange", "Use the access_token", "Errors", "Revocation"]) {
  check(`has a "${heading}" section`, md.includes(`## ${heading}`));
}
check("names the WWW-Authenticate challenge", md.includes("WWW-Authenticate"));
check("lists every scope", OAUTH_SCOPES.every((scope) => md.includes(`\`${scope}\``)));

console.log(`\n  ${pass} pass / ${fail} fail\n`);
process.exit(fail ? 1 : 0);
