import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { jwkThumbprint, parseSigningKey, type SigningKey } from "../web-bot-auth";

/**
 * Registry signatures (migration 093): when a module version is published,
 * the server signs `guidon-module-v1`, its id, version and the SHA-256 of
 * the manifest as the app reads it (the same digest install consent is
 * bound to) with an Ed25519 key (MODULE_SIGNING_KEY, a
 * private JWK - same format as AGENT_AUTH_PRIVATE_KEY, but its own key).
 * Installation refuses a version whose signature doesn't verify, so a
 * manifest changed in the database behind the registry's back is caught.
 * The public key is at /.well-known/guidon-module-signing-keys.json.
 * Without the variable nothing is signed and unsigned versions install as
 * before (development, self-hosting without a key).
 */
export function moduleSigningPayload(moduleId: string, version: string, digest: string): Buffer {
  return Buffer.from(`guidon-module-v1\n${moduleId}\n${version}\n${digest}`, "utf8");
}

export function moduleSigningKey(raw = process.env.MODULE_SIGNING_KEY): SigningKey | null {
  return parseSigningKey(raw);
}

export function signModuleVersion(key: SigningKey, moduleId: string, version: string, digest: string): { signature: string; keyId: string } {
  const privateKey = createPrivateKey({ key: { ...key.privateJwk }, format: "jwk" });
  return { signature: sign(null, moduleSigningPayload(moduleId, version, digest), privateKey).toString("base64url"), keyId: jwkThumbprint(key.privateJwk) };
}

export type SignatureCheck = "verified" | "unsigned" | "invalid" | "unknownKey";

/** "unknownKey": signed with a key this server doesn't hold (rotated) - shown, not trusted. */
export function checkModuleSignature(key: SigningKey | null, entry: { moduleId: string; version: string; digest: string; signature: string | null; keyId: string | null }): SignatureCheck {
  if (!entry.signature) return "unsigned";
  if (!key || entry.keyId !== jwkThumbprint(key.privateJwk)) return "unknownKey";
  try {
    const publicKey = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: key.privateJwk.x }, format: "jwk" });
    return verify(null, moduleSigningPayload(entry.moduleId, entry.version, entry.digest), publicKey, Buffer.from(entry.signature, "base64url")) ? "verified" : "invalid";
  } catch { return "invalid"; }
}
