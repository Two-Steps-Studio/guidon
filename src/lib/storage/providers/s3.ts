import "server-only";

import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { assertSafeBucket, assertSafeStoragePath, type StorageProvider, type UploadOptions } from "../provider";
import { appStorageUrl } from "../signed-url";

/**
 * S3-compatible object storage (AWS S3, Cloudflare R2, Backblaze B2, MinIO,
 * Wasabi...) for self-hosted installs that don't want files on the app's
 * disk. See docs/configuration.md (STORAGE_PROVIDER=s3).
 *
 * One physical bucket (S3_BUCKET): Guidon's logical buckets (avatars,
 * files, attachments...) become key prefixes, `<bucket>/<path>`. Hosting
 * providers often limit or price buckets, and one bucket keeps the IAM
 * policy a single resource.
 *
 * URLs: objects are served through the app's own /api/storage route with
 * the same signed URLs as the local provider, so inline/download rules
 * (SAFE_INLINE_EXTENSION_TO_MIME) and permanent public links (avatars, whose
 * URLs are stored in the database) behave identically; the bucket itself can
 * stay private. With S3_PUBLIC_URL set (a CDN or a public-read bucket),
 * `public: true` objects are linked there directly instead.
 */
export class S3StorageProvider implements StorageProvider {
  readonly name = "s3" as const;

  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string | null;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    const bucket = env.S3_BUCKET?.trim();
    if (!bucket) throw new Error("STORAGE_PROVIDER=s3 needs S3_BUCKET.");
    this.bucket = bucket;
    this.publicBaseUrl = env.S3_PUBLIC_URL?.trim().replace(/\/+$/, "") || null;

    const config: S3ClientConfig = {
      // R2 and most S3-compatible services accept any region; "auto" is R2's own.
      region: env.S3_REGION?.trim() || "us-east-1",
      forcePathStyle: env.S3_FORCE_PATH_STYLE === "true",
      // The SDK's default integrity checksums (since 3.729) are rejected by
      // several S3-compatible services; send them only where S3 requires one.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    };
    if (env.S3_ENDPOINT?.trim()) config.endpoint = env.S3_ENDPOINT.trim();
    // Without explicit keys the SDK's default chain applies (instance role,
    // AWS_* env vars, shared config) - the right thing on AWS itself.
    if (env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY) {
      config.credentials = { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY };
    }
    this.client = new S3Client(config);
  }

  /** `<bucket>/<path>`, both validated - the same contract as every provider. */
  private key(bucket: string, objectPath: string): string {
    return `${assertSafeBucket(bucket)}/${assertSafeStoragePath(objectPath)}`;
  }

  /** Logical buckets are prefixes; nothing to create. */
  async ensureBucket(bucket: string): Promise<void> {
    assertSafeBucket(bucket);
  }

  async upload(
    bucket: string,
    objectPath: string,
    body: File | Blob | ArrayBuffer | Uint8Array,
    options?: UploadOptions
  ): Promise<void> {
    const key = this.key(bucket, objectPath);
    if (!options?.upsert && (await this.statObject(bucket, objectPath))) {
      throw new Error(`Object already exists: ${objectPath}`);
    }
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: await toBytes(body),
        ContentType: options?.contentType || (body instanceof Blob && body.type) || "application/octet-stream",
      })
    );
  }

  async download(bucket: string, objectPath: string): Promise<Blob> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: this.key(bucket, objectPath) }));
    const bytes = await result.Body!.transformToByteArray();
    return new Blob([new Uint8Array(bytes)], { type: result.ContentType ?? "" });
  }

  async remove(bucket: string, paths: string[]): Promise<void> {
    const keys = paths.map((p) => this.key(bucket, p));
    // DeleteObjects takes at most 1000 keys; missing keys are not an error.
    for (let i = 0; i < keys.length; i += 1000) {
      const batch = keys.slice(i, i + 1000);
      const result = await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
        })
      );
      if (result.Errors?.length) {
        throw new Error(`Failed to delete ${result.Errors.length} object(s): ${result.Errors[0].Message ?? result.Errors[0].Code}`);
      }
    }
  }

  async getUrl(
    bucket: string,
    objectPath: string,
    options?: { expiresInSeconds?: number; public?: boolean }
  ): Promise<string> {
    if (options?.public && this.publicBaseUrl) {
      const key = this.key(bucket, objectPath);
      return `${this.publicBaseUrl}/${key.split("/").map(encodeURIComponent).join("/")}`;
    }
    return appStorageUrl(bucket, objectPath, options);
  }

  async usage(bucket: string, prefix: string): Promise<number> {
    const keyPrefix = this.key(bucket, prefix);
    let total = 0;
    let token: string | undefined;
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: keyPrefix, ContinuationToken: token })
      );
      for (const object of page.Contents ?? []) total += object.Size ?? 0;
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return total;
  }

  /** Size of an object, or null if it doesn't exist - /api/storage's 404 check. */
  async statObject(bucket: string, objectPath: string): Promise<{ size: number } | null> {
    try {
      const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: this.key(bucket, objectPath) }));
      return { size: head.ContentLength ?? 0 };
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 404) return null;
      throw error;
    }
  }

  /** The object's body as a web stream, for /api/storage to pass straight through. */
  async createWebStream(bucket: string, objectPath: string): Promise<ReadableStream> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: this.key(bucket, objectPath) }));
    return result.Body!.transformToWebStream();
  }
}

async function toBytes(body: File | Blob | ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  return new Uint8Array(await body.arrayBuffer());
}
