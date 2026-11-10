import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Proves to the official MCP Registry that whoever publishes
 * `com.useguidon/*` (server.json) controls useguidon.com: the publisher signs
 * with the Ed25519 private key (a GitHub secret, see
 * .github/workflows/publish-mcp.yml) and the registry checks the signature
 * against this public key. The public key is not a secret. 404 until it is
 * set, so nothing claims a key that doesn't exist.
 */
export function GET() {
  const key = process.env.MCP_REGISTRY_PUBLIC_KEY?.trim();
  // Raw 32-byte Ed25519 public key, base64 (44 characters).
  if (!key || !/^[A-Za-z0-9+/]{43}=$/.test(key)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return new Response(`v=MCPv1; k=ed25519; p=${key}`, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300" },
  });
}
