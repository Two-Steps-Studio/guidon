import { createHash, createPrivateKey, randomBytes, sign } from "node:crypto";

/**
 * Web Bot Auth: Guidon's outgoing requests (webhooks) carry an HTTP Message
 * Signature (RFC 9421) made with an Ed25519 key, and the public key is
 * published at /.well-known/http-message-signatures-directory - so a
 * receiver or a CDN can check that a request really comes from Guidon
 * (draft-meunier-web-bot-auth-architecture, draft-meunier-http-message-
 * signatures-directory). Off until WEB_BOT_AUTH_PRIVATE_KEY is set.
 *
 * The key is an Ed25519 private JWK (with "d" and "x"); "nbf"/"exp" in it
 * set the published lifetime. Make one with:
 *   node -e "const k=require('crypto').generateKeyPairSync('ed25519').privateKey.export({format:'jwk'});const n=Math.floor(Date.now()/1000);console.log(JSON.stringify({...k,nbf:n,exp:n+365*86400}))"
 *
 * Only node:crypto is imported, so tests/web-bot-auth.test.mjs loads this
 * file directly.
 */

export interface PrivateJwk {
  kty: "OKP";
  crv: "Ed25519";
  d: string;
  x: string;
  nbf?: number;
  exp?: number;
}

export interface PublicJwk {
  kty: "OKP";
  crv: "Ed25519";
  x: string;
  kid: string;
  use: "sig";
  nbf: number;
  exp: number;
}

export interface SigningKey {
  privateJwk: PrivateJwk;
  publicJwk: PublicJwk;
}

export const DIRECTORY_PATH = "/.well-known/http-message-signatures-directory";
export const DIRECTORY_CONTENT_TYPE = "application/http-message-signatures-directory+json";

/** JWK SHA-256 thumbprint (RFC 7638; for OKP the members are crv, kty, x - RFC 8037 A.3). */
export function jwkThumbprint(jwk: { crv: string; kty: string; x: string }): string {
  return createHash("sha256").update(JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x })).digest("base64url");
}

/**
 * The key from its env value, or null when unset or not an Ed25519 private
 * JWK. Without nbf/exp the key is published as valid from the start of this
 * year to the end of the next.
 */
export function parseSigningKey(raw: string | undefined, now = new Date()): SigningKey | null {
  if (!raw?.trim()) return null;
  let jwk: Partial<PrivateJwk>;
  try {
    jwk = JSON.parse(raw);
  } catch {
    return null;
  }
  if (jwk.kty !== "OKP" || jwk.crv !== "Ed25519" || typeof jwk.d !== "string" || typeof jwk.x !== "string") return null;
  const year = now.getUTCFullYear();
  const nbf = typeof jwk.nbf === "number" ? jwk.nbf : Date.UTC(year, 0, 1) / 1000;
  const exp = typeof jwk.exp === "number" ? jwk.exp : Date.UTC(year + 2, 0, 1) / 1000;
  const privateJwk = { kty: "OKP", crv: "Ed25519", d: jwk.d, x: jwk.x } as PrivateJwk;
  return {
    privateJwk,
    publicJwk: { kty: "OKP", crv: "Ed25519", x: jwk.x, kid: jwkThumbprint(privateJwk), use: "sig", nbf, exp },
  };
}

function signBase(base: string, key: PrivateJwk): string {
  return sign(null, Buffer.from(base, "utf8"), createPrivateKey({ key: { ...key }, format: "jwk" })).toString("base64");
}

/**
 * Signature-Agent, Signature-Input and Signature headers for one outgoing
 * request: covers @authority and Signature-Agent, tag "web-bot-auth", valid
 * for `ttlSeconds`. `agentOrigin` is where the key directory lives.
 */
export function signRequest(options: {
  url: string;
  key: SigningKey;
  agentOrigin: string;
  label?: string;
  ttlSeconds?: number;
  now?: number;
  nonce?: string;
}): Record<string, string> {
  const { url, key, agentOrigin, label = "sig1", ttlSeconds = 300 } = options;
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const nonce = options.nonce ?? randomBytes(32).toString("base64");
  const authority = new URL(url).host.toLowerCase();
  const params =
    `("@authority" "signature-agent";key="${label}")` +
    `;created=${now};keyid="${key.publicJwk.kid}";alg="ed25519";expires=${now + ttlSeconds}` +
    `;nonce="${nonce}";tag="web-bot-auth"`;
  const base =
    `"@authority": ${authority}\n` +
    `"signature-agent";key="${label}": "${agentOrigin}"\n` +
    `"@signature-params": ${params}`;
  return {
    "Signature-Agent": `${label}="${agentOrigin}"`,
    "Signature-Input": `${label}=${params}`,
    Signature: `${label}=:${signBase(base, key.privateJwk)}:`,
  };
}

/**
 * The key directory, signed with each key it lists (tag
 * "http-message-signatures-directory", over @authority;req and the body's
 * Content-Digest) so a client can check the directory itself.
 */
export function directoryResponse(options: { authority: string; keys: SigningKey[]; now?: number; ttlSeconds?: number }) {
  const { authority, keys, ttlSeconds = 86_400 } = options;
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const body = JSON.stringify({ keys: keys.map((key) => key.publicJwk) });
  const digest = `sha-256=:${createHash("sha256").update(body).digest("base64")}:`;
  const inputs: string[] = [];
  const signatures: string[] = [];
  keys.forEach((key, index) => {
    const label = `binding${index || ""}`;
    const params = `("@authority";req "content-digest");created=${now};expires=${now + ttlSeconds};keyid="${key.publicJwk.kid}";tag="http-message-signatures-directory"`;
    const base = `"@authority";req: ${authority.toLowerCase()}\n"content-digest": ${digest}\n"@signature-params": ${params}`;
    inputs.push(`${label}=${params}`);
    signatures.push(`${label}=:${signBase(base, key.privateJwk)}:`);
  });
  return {
    body,
    headers: {
      "Content-Type": DIRECTORY_CONTENT_TYPE,
      "Cache-Control": "public, max-age=86400",
      "Content-Digest": digest,
      ...(keys.length ? { "Signature-Input": inputs.join(", "), Signature: signatures.join(", ") } : {}),
    },
  };
}

let cached: { raw: string | undefined; key: SigningKey | null } | null = null;

/** The configured key (WEB_BOT_AUTH_PRIVATE_KEY), parsed once per value. */
export function signingKeyFromEnv(): SigningKey | null {
  const raw = process.env.WEB_BOT_AUTH_PRIVATE_KEY;
  if (!cached || cached.raw !== raw) cached = { raw, key: parseSigningKey(raw) };
  return cached.key;
}
