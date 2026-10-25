import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyAgentReadiness } from "../scripts/verify-agent-readiness.mjs";

const origin = "https://guidon.test";
function fixture(overrides = {}) {
  const requests = [];
  const metadata = {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`, token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`, revocation_endpoint: `${origin}/oauth/revoke`,
    code_challenge_methods_supported: ["S256"], authorization_response_iss_parameter_supported: true,
    service_documentation: `${origin}/auth.md`,
    ...overrides.metadata,
  };
  const fetcher = async (url, options) => {
    assert.equal(options.redirect, "manual");
    assert.equal(new URL(url).origin, origin);
    const path = new URL(url).pathname;
    const body = options.body ? JSON.parse(options.body) : null;
    requests.push({ path, options, body });
    if (path.startsWith("/oauth/")) {
      assert.equal(options.method, "OPTIONS", "Never register a client or exchange a token");
      return new Response(null, { status: path === "/oauth/authorize" ? 307 : 204 });
    }
    if (path === "/.well-known/oauth-protected-resource/api/mcp") return Response.json({ resource: `${origin}/api/mcp`, authorization_servers: [origin] });
    if (path === "/.well-known/oauth-authorization-server") return Response.json(metadata);
    if (path === "/auth.md") return new Response(Object.values(metadata).join(" "));
    if (path === "/api/mcp") return Response.json({}, { status: 401, headers: { "WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/api/mcp"` } });
    if (path === "/api/mcp/docs") {
      assert.equal(options.method, "POST");
      if (body.method === "initialize") return Response.json({ result: { serverInfo: { name: "guidon-docs" } } });
      assert.equal(body.method, "tools/list");
      return Response.json({ result: { tools: overrides.tools ?? ["search_docs", "read_doc"].map(name => ({ name, annotations: { readOnlyHint: true } })) } });
    }
    if (path === "/.well-known/mcp.json") return Response.json({ kind: "product", url: `${origin}/api/mcp`, servers: [{ kind: "docs", url: `${origin}/api/mcp/docs` }] });
    if (path === "/.well-known/http-message-signatures-directory") return Response.json({ error: "Not configured" }, { status: 404 });
    throw new Error(`Unexpected request: ${url}`);
  };
  return { fetcher, requests };
}

await test("auth discovery, protected product and distinct public docs pass without minting credentials", async () => {
  const { fetcher, requests } = fixture();
  const reports = await verifyAgentReadiness(origin, fetcher);
  assert.equal(reports.filter(report => report.status === "pass").length, 4);
  assert.equal(reports.find(report => report.name === "web-bot-auth").status, "pending");
  assert.ok(requests.every(request => request.options.method !== "POST" || request.path.startsWith("/api/mcp")));
});

await test("issuer mismatch fails even when the difference is only a trailing slash", async () => {
  const { fetcher } = fixture({ metadata: { issuer: `${origin}/` } });
  const reports = await verifyAgentReadiness(origin, fetcher);
  assert.equal(reports.find(report => report.name === "auth-chain").status, "fail");
});

await test("metadata cannot cause requests to a different authorization origin", async () => {
  const { fetcher, requests } = fixture({ metadata: { token_endpoint: "https://other.invalid/oauth/token" } });
  const reports = await verifyAgentReadiness(origin, fetcher);
  assert.equal(reports.find(report => report.name === "auth-chain").status, "fail");
  assert.ok(requests.every(request => request.path !== "/oauth/token"));
});

await test("missing docs MCP tools fail and canonical discovery redirects are not silently followed", async () => {
  const { fetcher } = fixture({ tools: [] });
  const reports = await verifyAgentReadiness(origin, (url, options) => url.endsWith("/.well-known/mcp.json") ? new Response(null, { status: 302 }) : fetcher(url, options));
  assert.equal(reports.find(report => report.name === "public-docs-mcp").status, "fail");
  assert.equal(reports.find(report => report.name === "mcp-discovery").status, "fail");
});
