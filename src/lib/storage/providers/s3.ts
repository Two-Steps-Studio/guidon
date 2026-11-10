import "server-only";
import { assertSafeBucket, assertSafeStoragePath, type StorageProvider, type UploadOptions } from "../provider";
import { signedAppStorageUrl } from "./local";
import { encode, sha256, signRequest } from "../s3-sigv4";

/**
 * Any S3-compatible object store: AWS S3, Cloudflare R2, MinIO, Backblaze B2,
 * Wasabi... One real bucket (S3_BUCKET) holds everything; Guidon's buckets
 * ("avatars", "files", ...) are key prefixes inside it.
 *
 * The browser never talks to the store. getUrl() returns the same HMAC-signed
 * /api/storage link as the local provider and that route streams the object,
 * so the bucket stays private, the CSP needs no extra origin, and the
 * inline-or-download decision (SAFE_INLINE_EXTENSION_TO_MIME) stays the same.
 *
 * Requests are signed with AWS Signature Version 4 (../s3-sigv4.ts) - a few
 * dozen lines of node:crypto instead of the AWS SDK.
 * shortcut: path-style URLs only (<endpoint>/<bucket>/<key>); add
 * virtual-hosted style if a provider ever stops accepting path-style.
 */

interface S3Config {
  endpoint: URL;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export function s3ConfigFromEnv(env: NodeJS.ProcessEnv = process.env): S3Config {
  const missing = ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"].filter((name) => !env[name]);
  if (missing.length) throw new Error(`STORAGE_PROVIDER=s3 needs ${missing.join(", ")}`);
  return {
    endpoint: new URL(env.S3_ENDPOINT!.replace(/\/+$/, "")),
    region: env.S3_REGION || "us-east-1",
    bucket: env.S3_BUCKET!,
    accessKeyId: env.S3_ACCESS_KEY_ID!,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
  };
}

export class S3StorageProvider implements StorageProvider {
  readonly name = "s3" as const;

  constructor(private readonly config: S3Config = s3ConfigFromEnv()) {}

  private objectUrl(key = ""): URL {
    const base = this.config.endpoint.pathname.replace(/\/+$/, "");
    const path = [this.config.bucket, ...(key ? key.split("/") : [])].map(encode).join("/");
    return new URL(`${this.config.endpoint.origin}${base}/${path}`);
  }

  private key(bucket: string, objectPath: string): string {
    return `${assertSafeBucket(bucket)}/${assertSafeStoragePath(objectPath)}`;
  }

  private async send(method: string, url: URL, body?: Uint8Array, headers?: Record<string, string>): Promise<Response> {
    const signed = signRequest(this.config, { method, url, payloadHash: sha256(body ?? ""), headers });
    return fetch(url, { method, headers: signed, body: body as BodyInit | undefined, cache: "no-store" });
  }

  private async fail(action: string, response: Response): Promise<never> {
    // The S3 error code only (e.g. NoSuchBucket, SignatureDoesNotMatch) - never the body's request ids or keys.
    const code = /<Code>([^<]+)<\/Code>/.exec(await response.text().catch(() => ""))?.[1];
    throw new Error(`S3 ${action} failed: ${response.status}${code ? ` ${code}` : ""}`);
  }

  async ensureBucket(): Promise<void> {
    // Buckets are key prefixes; the real bucket is created once by the operator.
  }

  async upload(bucket: string, objectPath: string, body: File | Blob | ArrayBuffer | Uint8Array, options?: UploadOptions): Promise<void> {
    const url = this.objectUrl(this.key(bucket, objectPath));
    const bytes = body instanceof Uint8Array ? body : new Uint8Array(body instanceof ArrayBuffer ? body : await body.arrayBuffer());
    const headers: Record<string, string> = { "content-type": options?.contentType ?? "application/octet-stream" };
    // Same contract as the other providers: no silent overwrite unless asked.
    if (!options?.upsert) headers["if-none-match"] = "*";
    const response = await this.send("PUT", url, bytes, headers);
    if (response.status === 412) throw new Error("The resource already exists");
    if (!response.ok) await this.fail("upload", response);
  }

  async download(bucket: string, objectPath: string): Promise<Blob> {
    const response = await this.send("GET", this.objectUrl(this.key(bucket, objectPath)));
    if (!response.ok) await this.fail("download", response);
    return response.blob();
  }

  async exists(bucket: string, objectPath: string): Promise<boolean> {
    const response = await this.send("HEAD", this.objectUrl(this.key(bucket, objectPath)));
    if (response.status === 404) return false;
    if (!response.ok) await this.fail("exists", response);
    return true;
  }

  async remove(bucket: string, paths: string[]): Promise<void> {
    for (const objectPath of paths) {
      const response = await this.send("DELETE", this.objectUrl(this.key(bucket, objectPath)));
      if (!response.ok && response.status !== 404) await this.fail("remove", response);
    }
  }

  async getUrl(bucket: string, objectPath: string, options?: { expiresInSeconds?: number; public?: boolean }): Promise<string> {
    return signedAppStorageUrl(bucket, objectPath, options);
  }

  async usage(bucket: string, prefix: string): Promise<number> {
    const keyPrefix = this.key(bucket, prefix);
    let total = 0;
    let token: string | undefined;
    do {
      const url = this.objectUrl();
      const query: Record<string, string> = { "list-type": "2", prefix: keyPrefix, ...(token ? { "continuation-token": token } : {}) };
      // Encoded by hand: URLSearchParams sends a space as "+", which the store reads differently from the signed "%20".
      url.search = Object.entries(query).map(([k, v]) => `${encode(k)}=${encode(v)}`).join("&");
      const response = await this.send("GET", url);
      if (!response.ok) await this.fail("usage", response);
      const xml = await response.text();
      for (const match of xml.matchAll(/<Size>(\d+)<\/Size>/g)) total += Number(match[1]);
      token = /<IsTruncated>true<\/IsTruncated>/.test(xml)
        ? /<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(xml)?.[1]
        : undefined;
    } while (token);
    return total;
  }

  async serveObject(bucket: string, objectPath: string): Promise<{ size: number; body: ReadableStream } | null> {
    const response = await this.send("GET", this.objectUrl(this.key(bucket, objectPath)));
    if (response.status === 404) return null;
    if (!response.ok || !response.body) await this.fail("read", response);
    return { size: Number(response.headers.get("content-length") ?? 0), body: response.body! };
  }
}
