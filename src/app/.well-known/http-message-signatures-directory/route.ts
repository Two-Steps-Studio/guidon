import { NextResponse } from "next/server";
import { directoryResponse, signingKeyFromEnv } from "@/lib/web-bot-auth";
import { SITE_URL } from "@/lib/site-url";

export const dynamic = "force-dynamic";

/**
 * Web Bot Auth key directory (src/lib/web-bot-auth.ts): the public key
 * Guidon's webhooks are signed with. 404 while no key is configured, so
 * nobody is told to expect signatures that never come.
 */
export function GET() {
  const key = signingKeyFromEnv();
  if (!key) {
    return NextResponse.json({ error: "This server does not sign its outgoing requests." }, { status: 404 });
  }
  const { body, headers } = directoryResponse({ authority: new URL(SITE_URL).host, keys: [key] });
  return new Response(body, { headers: { ...headers, "Access-Control-Allow-Origin": "*" } });
}

export { GET as HEAD };
