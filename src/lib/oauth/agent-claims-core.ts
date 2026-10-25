import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import { importJWK, jwtVerify, SignJWT } from "jose";
import { parseSigningKey } from "@/lib/web-bot-auth";

export const CLAIM_GRANT = "urn:workos:agent-auth:grant-type:claim";
export const ASSERTION_GRANT = "urn:ietf:params:oauth:grant-type:jwt-bearer";
export const CLAIM_TTL_SECONDS = 600;
export const CLAIM_INTERVAL = 5;
export const DEFAULT_AGENT_SCOPES = "tasks:read project:read";

export const hashClaimSecret = (value: string) => createHash("sha256").update(value).digest("hex");
export const claimEmailHash = (value: string) => hashClaimSecret(value.trim().toLowerCase());
export const isClaimHandle = (value: unknown): value is string => typeof value === "string" && /^(clm|cat)_[A-Za-z0-9_-]{43}$/.test(value);

export function createClaimSecrets() {
  return {
    claimToken: `clm_${randomBytes(32).toString("base64url")}`,
    attemptToken: `cat_${randomBytes(32).toString("base64url")}`,
    userCode: String(randomInt(0, 1_000_000)).padStart(6, "0"),
  };
}

/** Separate key purpose from outgoing HTTP signatures. Disabled until configured. */
export function agentSigningKey(raw = process.env.AGENT_AUTH_PRIVATE_KEY, now = new Date()) {
  const key = parseSigningKey(raw, now);
  const seconds = now.getTime() / 1000;
  return key && key.publicJwk.nbf <= seconds && key.publicJwk.exp > seconds ? key : null;
}

export async function mintAgentAssertion(id: string, issuer: string, expires: string) {
  const key = agentSigningKey();
  if (!key) throw new Error("Agent authentication is not configured.");
  const expiry = Math.min(Math.floor(Date.parse(expires) / 1000), key.publicJwk.exp);
  return new SignJWT({})
    .setProtectedHeader({ alg: "EdDSA", typ: "oauth-id-jag+jwt", kid: key.publicJwk.kid })
    .setIssuer(issuer).setAudience(issuer).setSubject(id).setJti(randomUUID())
    .setIssuedAt().setExpirationTime(expiry)
    .sign(await importJWK(key.privateJwk, "EdDSA"));
}

export async function verifyAgentAssertion(raw: string, issuer: string): Promise<string | null> {
  const key = agentSigningKey();
  if (!key || raw.length > 16_384) return null;
  try {
    const { payload, protectedHeader } = await jwtVerify(raw, await importJWK(key.publicJwk, "EdDSA"), {
      algorithms: ["EdDSA"], issuer, audience: issuer, typ: "oauth-id-jag+jwt", requiredClaims: ["sub","iat","exp","jti"],
    });
    if (protectedHeader.kid !== key.publicJwk.kid || payload.aud !== issuer
      || !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp)
      || payload.exp! <= payload.iat! || typeof payload.jti !== "string" || !payload.jti
      || payload.iat! > Date.now() / 1000 + 30
      || payload.exp! - payload.iat! > 86400 || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(payload.sub ?? "")) return null;
    return payload.sub!;
  } catch { return null; }
}
