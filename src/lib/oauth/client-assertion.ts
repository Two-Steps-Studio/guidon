// Pure cryptographic verification, also exercised by the Node test runner.
import { createLocalJWKSet, decodeJwt, jwtVerify, type JSONWebKeySet } from "jose";

export const CLIENT_ASSERTION_TYPE = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";
export const MAX_ASSERTION_LENGTH = 16 * 1024;
export const ASSERTION_MAX_AGE_SECONDS = 300;

/** An unverified subject is only a lookup hint; verifyClientAssertion binds it to a trusted key. */
export function assertionClientId(assertion: string): string {
  if (assertion.length > MAX_ASSERTION_LENGTH) return "";
  try {
    const { sub } = decodeJwt(assertion);
    return typeof sub === "string" && sub.length <= 2000 ? sub : "";
  } catch {
    return "";
  }
}

export async function verifyClientAssertion(input: {
  assertion: string;
  clientId: string;
  audience: string[];
  jwks: JSONWebKeySet;
  consume: (jti: string, expiresAt: Date) => Promise<boolean>;
  now?: Date;
}): Promise<boolean> {
  if (!input.assertion || input.assertion.length > MAX_ASSERTION_LENGTH) return false;
  try {
    const { payload } = await jwtVerify(input.assertion, createLocalJWKSet(input.jwks), {
      algorithms: ["RS256", "PS256", "ES256", "ES384", "EdDSA"],
      issuer: input.clientId,
      subject: input.clientId,
      audience: input.audience,
      requiredClaims: ["iss", "sub", "aud", "iat", "exp", "jti"],
      maxTokenAge: ASSERTION_MAX_AGE_SECONDS,
      clockTolerance: 30,
      currentDate: input.now,
    });
    if (typeof payload.iat !== "number" || typeof payload.exp !== "number" ||
        payload.exp <= payload.iat || payload.exp - payload.iat > ASSERTION_MAX_AGE_SECONDS ||
        typeof payload.jti !== "string" || !payload.jti || payload.jti.length > 200) return false;
    // Retain the replay key through the verifier's clock-tolerance window.
    return await input.consume(payload.jti, new Date((payload.exp + 30) * 1000));
  } catch {
    return false;
  }
}
