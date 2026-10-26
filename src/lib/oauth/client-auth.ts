import "server-only";

import { createHash } from "node:crypto";
import type { JSONWebKeySet } from "jose";
import { serviceDataClient } from "@/lib/data-client";
import { SITE_URL } from "@/lib/site-url";
import { fetchMetadataDocument } from "./oauth";
import { isMetadataDocumentClientId, validateClientAuthentication, validateMetadataDocument } from "./oauth-core";
import { CLIENT_ASSERTION_TYPE, verifyClientAssertion } from "./client-assertion";

/** Authenticate before touching a code, refresh token or revocation target. Fail closed on metadata/key errors. */
export async function authenticateOAuthClient(
  clientId: string,
  params: Record<string, string>,
  endpoint: "token" | "revoke",
): Promise<boolean> {
  if (!clientId) return false;
  if (!isMetadataDocumentClientId(clientId)) {
    // DCR only registers public clients. Their code/refresh token still binds the client_id.
    return !params.client_assertion && !params.client_assertion_type;
  }
  // Only a client someone signed in and consented to (/oauth/authorize stores
  // it) can hold a code or token here. Checking that first keeps this public
  // endpoint from fetching arbitrary URLs for anonymous callers.
  const { data: known } = await serviceDataClient()
    .from<{ client_id: string }>("oauth_clients")
    .select("client_id")
    .eq("client_id", clientId)
    .maybeSingle();
  if (!known) return false;
  try {
    // Do not use the consent screen's DB cache here: it stores presentation
    // metadata, not the authentication method or keys. A stale cached public
    // client must never bypass private_key_jwt authentication.
    const document = await fetchMetadataDocument(clientId);
    if ("error" in validateMetadataDocument(clientId, document)) return false;
    const checked = validateClientAuthentication(document as Record<string, unknown>);
    if ("error" in checked) return false;
    if (checked.auth.method === "none") return !params.client_assertion && !params.client_assertion_type;
    if (params.client_assertion_type !== CLIENT_ASSERTION_TYPE || !params.client_assertion) return false;
    const jwks = checked.auth.jwks ?? await fetchMetadataDocument(checked.auth.jwksUri!);
    const keys = validateClientAuthentication({ token_endpoint_auth_method: "private_key_jwt", jwks });
    if ("error" in keys) return false;
    return await verifyClientAssertion({
      assertion: params.client_assertion,
      clientId,
      audience: [SITE_URL, `${SITE_URL}/oauth/${endpoint}`],
      jwks: jwks as JSONWebKeySet,
      consume: async (jti, expiresAt) => {
        const db = serviceDataClient();
        const { error: cleanupError } = await db.from("oauth_client_assertions").delete().lt("expires_at", new Date().toISOString());
        if (cleanupError) return false;
        const assertionHash = createHash("sha256").update(JSON.stringify([clientId, jti])).digest("hex");
        // A database primary key makes this atomic across processes and replicas.
        const { error } = await db.from("oauth_client_assertions").insert({ assertion_hash: assertionHash, expires_at: expiresAt.toISOString() });
        return !error;
      },
    });
  } catch {
    return false;
  }
}
