// AWS Signature Version 4 for S3 requests (providers/s3.ts). No imports
// beyond node:crypto: loaded by tests/storage/s3.test.mjs with Node's type
// stripping.
import { createHash, createHmac } from "node:crypto";

export const sha256 = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");
const hmac = (key: string | Buffer, data: string) => createHmac("sha256", key).update(data).digest();
/** RFC 3986 encoding, as SigV4 requires (encodeURIComponent leaves !'()* alone). */
export const encode = (value: string) =>
  encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** Headers (with Authorization) for one SigV4-signed S3 request; the caller's URL path must already be RFC 3986-encoded. */
export function signRequest(
  config: { region: string; accessKeyId: string; secretAccessKey: string },
  request: { method: string; url: URL; payloadHash: string; headers?: Record<string, string> },
  now = new Date()
): Record<string, string> {
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const day = amzDate.slice(0, 8);
  const headers: Record<string, string> = {
    ...Object.fromEntries(Object.entries(request.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v.trim()])),
    host: request.url.host,
    "x-amz-content-sha256": request.payloadHash,
    "x-amz-date": amzDate,
  };
  const names = Object.keys(headers).sort();
  const query = [...request.url.searchParams.entries()]
    .map(([k, v]) => [encode(k), encode(v)])
    .sort(([a, x], [b, y]) => (a === b ? (x < y ? -1 : 1) : a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const canonical = [
    request.method,
    request.url.pathname,
    query,
    names.map((n) => `${n}:${headers[n]}\n`).join(""),
    names.join(";"),
    request.payloadHash,
  ].join("\n");
  const scope = `${day}/${config.region}/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join("\n");
  const key = hmac(hmac(hmac(hmac(`AWS4${config.secretAccessKey}`, day), config.region), "s3"), "aws4_request");
  const signature = createHmac("sha256", key).update(toSign).digest("hex");
  // fetch sets Host itself (from the URL, the same value signed above).
  delete headers.host;
  return {
    ...headers,
    authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}`,
  };
}
