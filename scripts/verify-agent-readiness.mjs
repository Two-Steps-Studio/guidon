#!/usr/bin/env node
import { pathToFileURL } from "node:url";

/** Non-mutating deployment smoke check. Never registers a client or exchanges credentials. */
export async function verifyAgentReadiness(site, fetcher = fetch) {
  const origin = new URL(site).origin;
  if (site.replace(/\/$/, "") !== origin) throw new Error("Use the canonical origin without a path, credentials or query.");
  const reports = [];
  const request = async (path, init = {}) => {
    const response = await fetcher(`${origin}${path}`, {
      redirect: "manual", signal: AbortSignal.timeout(10000), ...init,
    });
    // An authorization-page preflight may redirect to sign-in. Discovery
    // documents must be canonical; no redirect is followed in either case.
    if (response.status >= 300 && response.status < 400 && init.method !== "OPTIONS") throw new Error(`${path} redirects (${response.status}); inspect the canonical URL.`);
    return response;
  };
  const json = async path => {
    const response = await request(path);
    if (response.status !== 200) throw new Error(`${path}: HTTP ${response.status}`);
    return response.json();
  };
  const expect = (condition, detail) => { if (!condition) throw new Error(detail); };
  const check = async (name, action) => {
    try { reports.push({ name, status: "pass", detail: await action() }); }
    catch (error) { reports.push({ name, status: "fail", detail: error.message }); }
  };
  await check("auth-chain", async () => {
    const resource = await json("/.well-known/oauth-protected-resource/api/mcp");
    expect(resource.resource === `${origin}/api/mcp`, "Protected resource must match the product MCP URL exactly.");
    expect(resource.authorization_servers?.includes(origin), "Protected resource does not name the canonical issuer.");
    const metadata = await json("/.well-known/oauth-authorization-server");
    expect(metadata.issuer === origin, "Authorization server issuer differs from the canonical origin.");
    const auth = await request("/auth.md");
    expect(auth.status === 200, `auth.md: HTTP ${auth.status}`);
    const markdown = await auth.text();
    for (const [field, path] of Object.entries({ authorization_endpoint: "/oauth/authorize", token_endpoint: "/oauth/token", registration_endpoint: "/oauth/register", revocation_endpoint: "/oauth/revoke" })) {
      expect(metadata[field] === `${origin}${path}`, `${field} does not use the expected canonical endpoint.`);
      expect(markdown.includes(`${origin}${path}`), `auth.md does not document ${field}.`);
      const probe = await request(path, { method: "OPTIONS" });
      expect(probe.status >= 200 && probe.status < 500 && probe.status !== 404, `${path} preflight is unreachable (${probe.status}).`);
    }
    expect(metadata.code_challenge_methods_supported?.includes("S256"), "PKCE S256 is missing.");
    expect(metadata.authorization_response_iss_parameter_supported === true, "Authorization-response issuer support is not advertised.");
    expect(metadata.service_documentation === `${origin}/auth.md`, "AS metadata must link to auth.md.");
    return "PRM → exact issuer → documented endpoints; OPTIONS only, no registration or token issuance.";
  });
  const rpc = (method, params) => ({ method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, ...(params ? { params } : {}) }) });
  await check("product-mcp-protected", async () => {
    const response = await request("/api/mcp", rpc("tools/list"));
    expect(response.status === 401, `Unauthenticated product MCP must return 401, got ${response.status}.`);
    expect(response.headers.get("www-authenticate")?.includes(`resource_metadata="${origin}/.well-known/oauth-protected-resource/api/mcp"`), "401 challenge does not link the canonical PRM.");
    return "Authentication retained. Authorized tool access requires a separate connected-client check.";
  });
  await check("public-docs-mcp", async () => {
    const response = await request("/api/mcp/docs", rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "guidon-readiness-check", version: "1.0.0" } }));
    expect(response.status === 200, `Docs initialize: HTTP ${response.status}`);
    const initialized = await response.json();
    expect(initialized.result?.serverInfo?.name === "guidon-docs", "Docs server did not initialize as guidon-docs.");
    const list = await request("/api/mcp/docs", rpc("tools/list"));
    expect(list.status === 200, `Docs tools/list: HTTP ${list.status}`);
    const tools = (await list.json()).result?.tools ?? [];
    expect(["search_docs", "read_doc"].every(name => tools.some(tool => tool.name === name && tool.annotations?.readOnlyHint === true)), "Public docs MCP must expose search_docs and read_doc as read-only tools.");
    return "Public initialize and tools/list succeed; product tools were not made anonymous.";
  });
  await check("mcp-discovery", async () => {
    const manifest = await json("/.well-known/mcp.json");
    expect(manifest.kind === "product" && manifest.url === `${origin}/api/mcp`, "Root MCP manifest must identify the product endpoint.");
    expect(manifest.servers?.some(server => server.kind === "docs" && server.url === `${origin}/api/mcp/docs`), "Manifest must also identify the separate docs endpoint.");
    return "Distinct product and documentation MCP URLs are discoverable.";
  });
  await check("web-bot-auth", async () => {
    const response = await request("/.well-known/http-message-signatures-directory");
    if (response.status === 404) return "Not enabled: configure a real WEB_BOT_AUTH_PRIVATE_KEY before publishing a signed directory.";
    expect(response.status === 200, `Key directory: HTTP ${response.status}`);
    const keys = (await response.json()).keys;
    const now = Date.now() / 1000;
    expect(Array.isArray(keys) && keys.length > 0, "Key directory has no keys.");
    expect(keys.every(key => key.kty === "OKP" && key.crv === "Ed25519" && typeof key.x === "string" && typeof key.kid === "string" && Number.isSafeInteger(key.nbf) && Number.isSafeInteger(key.exp) && key.nbf <= now && key.exp > now && !("d" in key)), "Directory contains an invalid, inactive or private key.");
    return "Active public Ed25519 key metadata present; private material absent.";
  });
  // An absent optional signing configuration is pending work, not a false pass.
  const signing = reports.find(report => report.name === "web-bot-auth");
  if (signing?.status === "pass" && signing.detail.startsWith("Not enabled:")) signing.status = "pending";
  return reports;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 3) throw new Error("Usage: node scripts/verify-agent-readiness.mjs <canonical-origin>");
    const reports = await verifyAgentReadiness(process.argv[2]);
    for (const report of reports) console.log(`${report.status.toUpperCase()} ${report.name}: ${report.detail}`);
    console.log("This checks deployment behavior, not search rank, registry publication or an orank score.");
    if (reports.some(report => report.status === "fail")) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
