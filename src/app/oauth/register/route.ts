import { NextRequest } from "next/server";
import { registerClient } from "@/lib/oauth/oauth";
import { validateRegistration } from "@/lib/oauth/oauth-core";
import { oauthJson, preflight, registrationLimited } from "@/lib/oauth/http";

/**
 * Dynamic Client Registration (RFC 7591) for MCP clients that don't use a
 * Client ID Metadata Document. Public clients only: the answer always says
 * token_endpoint_auth_method "none" and carries no secret.
 */
export async function POST(request: NextRequest) {
  if (registrationLimited(request)) {
    return oauthJson({ error: "invalid_client_metadata", error_description: "Too many registrations from this address. Try again later." }, 429);
  }
  const body = await request.json().catch(() => null);
  const checked = validateRegistration(body);
  if ("error" in checked) return oauthJson({ error: checked.error, error_description: checked.description }, 400);

  const client = await registerClient(checked.client);
  return oauthJson(
    {
      client_id: client.client_id,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: client.client_name,
      redirect_uris: client.redirect_uris,
      ...(client.client_uri ? { client_uri: client.client_uri } : {}),
      ...(client.logo_uri ? { logo_uri: client.logo_uri } : {}),
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
    201
  );
}

export const OPTIONS = preflight;
