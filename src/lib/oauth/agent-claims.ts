import "server-only";
import { serviceDataClient } from "@/lib/data-client";
import { generateApiKey, hashApiKey, keyPrefix } from "@/lib/api/api-keys";
import { getClient } from "./oauth";
import { normalizeResource, parseScopes } from "./oauth-core";
import { SITE_URL } from "@/lib/site-url";
import { CLAIM_INTERVAL, CLAIM_TTL_SECONDS, DEFAULT_AGENT_SCOPES, agentSigningKey, claimEmailHash,
  createClaimSecrets, hashClaimSecret, isClaimHandle, mintAgentAssertion, verifyAgentAssertion } from "./agent-claims-core";

export type AgentRegistration = {
  id: string; client_name: string; email_hash: string; scopes: string[];
  state: "pending" | "approved" | "denied"; claim_expires_at: string;
};

export async function startAgentClaim(input: Record<string, string>) {
  if (!agentSigningKey()) return { error: "temporarily_unavailable" };
  if (input.type !== "service_auth" || !input.login_hint || input.login_hint.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.login_hint)) {
    return { error: "invalid_request", error_description: "Use service_auth with login_hint (email) and a registered public client_id." };
  }
  const found = await getClient(input.client_id ?? "");
  // This ceremony is for public DCR clients. It must not bypass the signed
  // authentication policy of CIMD clients; they use the existing OAuth flow.
  if (!found.client || found.client.kind !== "dcr") return { error: "invalid_client" };
  const scopes = parseScopes(input.scope?.trim() || DEFAULT_AGENT_SCOPES);
  if ("error" in scopes) return { error: "invalid_scope" };
  const resource = normalizeResource(input.resource, SITE_URL) ?? null;
  if (input.resource && !resource) return { error: "invalid_target" };
  const resolvedResource = resource || `${SITE_URL}/api/mcp`;
  const { claimToken, attemptToken, userCode } = createClaimSecrets();
  const expiry = new Date(Date.now() + CLAIM_TTL_SECONDS * 1000).toISOString();
  // Service access: the opaque handles are server-minted; no user_id is accepted.
  const db = serviceDataClient();
  // Short-lived handles and their secret-free audit events expire together.
  // Grant/connected-app history remains managed by its existing lifecycle.
  const cleanup = await db.from("agent_registrations").delete()
    .lt("expires_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  if (cleanup.error) throw new Error("Could not expire old agent approvals.");
  const { data, error } = await db.from<{ id: string }>("agent_registrations").insert({
    client_id: found.client.client_id, client_name: found.client.client_name,
    email_hash: claimEmailHash(input.login_hint), claim_hash: hashClaimSecret(claimToken),
    attempt_hash: hashClaimSecret(attemptToken), code_hash: hashClaimSecret(userCode),
    scopes: scopes.scopes, resource: resolvedResource, expires_at: expiry, claim_expires_at: expiry,
  }).select("id").single();
  if (error || !data) throw new Error("Could not start agent approval.");
  const returnPath = `/oauth/claim?attempt=${encodeURIComponent(attemptToken)}`;
  return {
    registration_id: data.id, registration_type: "service_auth", claim_token: claimToken,
    claim_token_expires: expiry, post_claim_scopes: scopes.scopes,
    claim: { user_code: userCode, verification_uri: `${SITE_URL}/auth/login?redirect=${encodeURIComponent(returnPath)}`,
      expires_in: CLAIM_TTL_SECONDS, interval: CLAIM_INTERVAL },
  };
}

export async function getAgentClaim(attempt: string): Promise<AgentRegistration | null> {
  if (!agentSigningKey() || !isClaimHandle(attempt) || !attempt.startsWith("cat_")) return null;
  // Only the signed-in consent screen calls this; never return the secret hashes to a client.
  const { data, error } = await serviceDataClient().from<AgentRegistration>("agent_registrations")
    .select("id, client_name, email_hash, scopes, state, claim_expires_at")
    .eq("attempt_hash", hashClaimSecret(attempt))
    .gt("claim_expires_at", new Date().toISOString()).maybeSingle();
  if (error) throw new Error("Could not load agent approval.");
  return data;
}

export async function decideAgentClaim(attempt: string, user: { id: string; email?: string }, code: string, allow: boolean) {
  if (!agentSigningKey() || !isClaimHandle(attempt) || !attempt.startsWith("cat_") || !user.email) return "invalid";
  // Identity comes from getCurrentUser, never form fields. SQL serializes
  // attempts and creates the existing revocable grant in the same transaction.
  const { data, error } = await serviceDataClient().rpc<{ status: string }>("decide_agent_claim", {
    p_attempt_hash: hashClaimSecret(attempt), p_user_id: user.id, p_email_hash: claimEmailHash(user.email),
    p_code_hash: hashClaimSecret(code.trim()), p_allow: allow,
  });
  if (error) throw new Error("Could not decide agent approval.");
  return data?.status ?? "invalid";
}

export async function exchangeAgentClaim(params: Record<string, string>, isClaim: boolean) {
  if (!agentSigningKey()) return { error: "unsupported_grant_type" };
  const claim = params.claim_token ?? "";
  let registrationId: string | null = null;
  if (isClaim) {
    if (!isClaimHandle(claim) || !claim.startsWith("clm_")) return { error: "invalid_grant" };
  } else {
    registrationId = await verifyAgentAssertion(params.assertion ?? "", SITE_URL);
    if (!registrationId) return { error: "invalid_grant" };
  }
  const resource = normalizeResource(params.resource, SITE_URL);
  if (resource === null) return { error: "invalid_target" };
  const token = generateApiKey();
  // Hash-only credential storage and locked state checks/issuance are atomic
  // in both Supabase and direct Postgres. Scope and user always come from consent.
  const { data, error } = await serviceDataClient().rpc<{
    status: string; registration_id: string; assertion_expires: string; expires_in: number; scope: string;
  }>("issue_agent_claim_token", {
    p_claim_hash: isClaim ? hashClaimSecret(claim) : null, p_registration_id: registrationId,
    p_resource: resource ?? `${SITE_URL}/api/mcp`, p_key_hash: hashApiKey(token), p_key_prefix: keyPrefix(token),
  });
  if (error || !data) throw new Error("Could not exchange agent approval.");
  if (data.status !== "issued") return { error: data.status };
  const assertionExpiry = new Date(Math.min(Date.parse(data.assertion_expires), agentSigningKey()!.publicJwk.exp * 1000)).toISOString();
  return {
    access_token: token, token_type: "Bearer", expires_in: data.expires_in, scope: data.scope,
    ...(isClaim ? { identity_assertion: await mintAgentAssertion(data.registration_id, SITE_URL, assertionExpiry),
      assertion_expires: assertionExpiry } : {}),
  };
}
