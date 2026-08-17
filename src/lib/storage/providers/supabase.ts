import "server-only";

import { createServiceClient } from "@/lib/supabase-server";
import {
  assertSafeBucket,
  assertSafeStoragePath,
  type StorageProvider,
  type UploadOptions,
} from "../provider";

/**
 * Supabase Storage — the cloud default, and the behaviour Guidon shipped with.
 *
 * Uses the service-role client because these operations run inside API routes
 * that have already authorised the caller against project_members. Storage
 * itself carries no RLS equivalent, so authorisation must happen above this
 * layer, never here.
 */
export class SupabaseStorageProvider implements StorageProvider {
  readonly name = "supabase" as const;

  async ensureBucket(
    bucket: string,
    options?: { public?: boolean }
  ): Promise<void> {
    assertSafeBucket(bucket);
    const client = createServiceClient();

    const { data: existing } = await client.storage.getBucket(bucket);
    if (existing) return;

    const { error } = await client.storage.createBucket(bucket, {
      public: options?.public ?? false,
    });

    // A concurrent request may have created it between the check and the call.
    if (error && !/already exists/i.test(error.message)) {
      throw error;
    }
  }

  async upload(
    bucket: string,
    path: string,
    body: File | Blob | ArrayBuffer | Uint8Array,
    options?: UploadOptions
  ): Promise<void> {
    assertSafeBucket(bucket);
    const safePath = assertSafeStoragePath(path);

    const client = createServiceClient();
    const { error } = await client.storage.from(bucket).upload(safePath, body, {
      contentType: options?.contentType,
      upsert: options?.upsert ?? false,
    });

    if (error) throw error;
  }

  async download(bucket: string, path: string): Promise<Blob> {
    assertSafeBucket(bucket);
    const safePath = assertSafeStoragePath(path);

    const client = createServiceClient();
    const { data, error } = await client.storage.from(bucket).download(safePath);

    if (error) throw error;
    if (!data) throw new Error(`No such object: ${safePath}`);

    return data;
  }

  async remove(bucket: string, paths: string[]): Promise<void> {
    if (paths.length === 0) return;

    assertSafeBucket(bucket);
    const safePaths = paths.map(assertSafeStoragePath);

    const client = createServiceClient();
    const { error } = await client.storage.from(bucket).remove(safePaths);

    if (error) throw error;
  }

  async getUrl(
    bucket: string,
    path: string,
    expiresInSeconds = 600
  ): Promise<string> {
    assertSafeBucket(bucket);
    const safePath = assertSafeStoragePath(path);

    const client = createServiceClient();
    const { data, error } = await client.storage
      .from(bucket)
      .createSignedUrl(safePath, expiresInSeconds);

    if (error) throw error;
    if (!data?.signedUrl) throw new Error(`Could not sign URL for ${safePath}`);

    return data.signedUrl;
  }
}
