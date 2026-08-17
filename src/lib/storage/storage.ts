/**
 * Guidon Storage Utilities
 * 
 * Provides file upload, deletion, and validation utilities for Guidon.
 * Uses Supabase Storage with dedicated buckets for Guidon.
 */

import { createServiceClient } from "@/lib/supabase-server";
import { getStorageProvider } from "./provider";
import { 
  STORAGE_BUCKETS, 
  ALLOWED_FILE_EXTENSIONS, 
  ALLOWED_IMAGE_TYPES,
  ALLOWED_DOCUMENT_TYPES,
  ALLOWED_ARCHIVE_TYPES,
  FILE_SIZE_LIMITS,
  PROJECT_STORAGE_QUOTA,
  FILE_CATEGORIES,
  type FileCategory
} from "./storage-constants";

// ============================================
// BUCKET MANAGEMENT
// ============================================

/**
 * Check if a bucket exists and is accessible
 */
export async function checkBucketExists(bucket: string): Promise<boolean> {
  try {
    const provider = await getStorageProvider();
    await provider.ensureBucket(bucket);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure a storage bucket exists, creating it if necessary
 */
export async function ensureBucketExists(
  bucket: string, 
  options?: { public?: boolean; fileSizeLimit?: number }
): Promise<{ created: boolean; error?: string }> {
  try {
    const provider = await getStorageProvider();
    await provider.ensureBucket(bucket, { public: options?.public ?? false });
    return { created: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Storage] Error ensuring bucket '${bucket}':`, message);
    return { created: false, error: message };
  }
}

/**
 * Initialize all Guidon storage buckets
 */
export async function initializeStorageBuckets(): Promise<void> {
  const buckets = [
    { name: STORAGE_BUCKETS.FILES, public: true, fileSizeLimit: FILE_SIZE_LIMITS.DOCUMENT },
    { name: STORAGE_BUCKETS.ATTACHMENTS, public: true, fileSizeLimit: FILE_SIZE_LIMITS.ATTACHMENT },
    { name: STORAGE_BUCKETS.EXPORTS, public: true, fileSizeLimit: FILE_SIZE_LIMITS.EXPORT },
  ];

  for (const bucket of buckets) {
    await ensureBucketExists(bucket.name, {
      public: bucket.public,
      fileSizeLimit: bucket.fileSizeLimit,
    });
  }
}

// ============================================
// FILE UPLOAD
// ============================================

/**
 * Upload a file to Supabase storage
 */
export async function uploadFile(
  bucket: string,
  filePath: string,
  file: File,
  options?: {
    upsert?: boolean;
    contentType?: string;
  }
) {
  const provider = await getStorageProvider();

  try {
    await provider.upload(bucket, filePath, file, {
      upsert: options?.upsert ?? false,
      contentType: options?.contentType ?? file.type,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Storage] Upload error:', message);

    if (/bucket not found|nosuchbucket|enoent/i.test(message)) {
      throw new Error(
        `Storage bucket '${bucket}' does not exist or is not accessible.`
      );
    }
    throw new Error(`Upload failed: ${message}`);
  }

  return {
    path: filePath,
    publicUrl: await provider.getUrl(bucket, filePath),
  };
}

/**
 * Upload a project file
 */
export async function uploadProjectFile(
  projectId: string,
  file: File,
  category: FileCategory = "other",
  userId: string
) {
  // Validate file extension
  if (!validateFileExtension(file.name)) {
    throw new Error(`Unsupported file extension. Allowed: ${ALLOWED_FILE_EXTENSIONS.join(', ')}`);
  }

  // Validate file size based on category
  const sizeLimit = getFileSizeLimit(category);
  if (file.size > sizeLimit) {
    const sizeMB = (sizeLimit / (1024 * 1024)).toFixed(0);
    throw new Error(`File is too large. Maximum size: ${sizeMB}MB`);
  }

  // Ensure the files bucket exists
  const bucketResult = await ensureBucketExists(STORAGE_BUCKETS.FILES, { 
    public: true,
    fileSizeLimit: FILE_SIZE_LIMITS.DOCUMENT 
  });
  if (bucketResult.error) {
    throw new Error(`Storage bucket '${STORAGE_BUCKETS.FILES}' could not be created: ${bucketResult.error}`);
  }

  const timestamp = Date.now();
  const extension = file.name.split('.').pop();
  const filePath = `projects/${projectId}/${category}/${userId}/${timestamp}.${extension}`;

  try {
    return await uploadFile(STORAGE_BUCKETS.FILES, filePath, file);
  } catch (error: any) {
    if (error.message?.includes('Bucket not found') || error.message?.includes('NoSuchBucket')) {
      throw new Error(`Storage bucket '${STORAGE_BUCKETS.FILES}' does not exist or is not accessible.`);
    }
    throw error;
  }
}

/**
 * Upload a task attachment
 */
export async function uploadTaskAttachment(
  projectId: string,
  taskId: string,
  file: File,
  userId: string
) {
  // Validate file extension
  if (!validateFileExtension(file.name)) {
    throw new Error(`Unsupported file extension. Allowed: ${ALLOWED_FILE_EXTENSIONS.join(', ')}`);
  }

  // Validate file size
  if (file.size > FILE_SIZE_LIMITS.ATTACHMENT) {
    const sizeMB = (FILE_SIZE_LIMITS.ATTACHMENT / (1024 * 1024)).toFixed(0);
    throw new Error(`File is too large. Maximum size: ${sizeMB}MB`);
  }

  // Ensure the attachments bucket exists
  const bucketResult = await ensureBucketExists(STORAGE_BUCKETS.ATTACHMENTS, { 
    public: true,
    fileSizeLimit: FILE_SIZE_LIMITS.ATTACHMENT 
  });
  if (bucketResult.error) {
    throw new Error(`Storage bucket '${STORAGE_BUCKETS.ATTACHMENTS}' could not be created: ${bucketResult.error}`);
  }

  const timestamp = Date.now();
  const extension = file.name.split('.').pop();
  const filePath = `projects/${projectId}/tasks/${taskId}/${userId}/${timestamp}.${extension}`;

  try {
    return await uploadFile(STORAGE_BUCKETS.ATTACHMENTS, filePath, file);
  } catch (error: any) {
    if (error.message?.includes('Bucket not found') || error.message?.includes('NoSuchBucket')) {
      throw new Error(`Storage bucket '${STORAGE_BUCKETS.ATTACHMENTS}' does not exist or is not accessible.`);
    }
    throw error;
  }
}

// ============================================
// FILE DELETION
// ============================================

/**
 * Delete a file from Supabase storage
 */
export async function deleteFile(bucket: string, filePath: string): Promise<boolean> {
  const provider = await getStorageProvider();

  try {
    await provider.remove(bucket, [filePath]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Storage] Delete error:', message);
    throw new Error(`Delete failed: ${message}`);
  }

  return true;
}

/**
 * Delete a project file
 */
export async function deleteProjectFile(storagePath: string): Promise<boolean> {
  return deleteFile(STORAGE_BUCKETS.FILES, storagePath);
}

/**
 * Delete a task attachment
 */
export async function deleteTaskAttachment(storagePath: string): Promise<boolean> {
  return deleteFile(STORAGE_BUCKETS.ATTACHMENTS, storagePath);
}

// ============================================
// FILE URLS
// ============================================

/**
 * Get a public URL for a file
 */
export async function getPublicUrl(bucket: string, filePath: string): Promise<string> {
  const provider = await getStorageProvider();
  return provider.getUrl(bucket, filePath);
}

/**
 * Get a signed URL for a private file (expires in 1 hour by default)
 */
export async function getSignedUrl(
  bucket: string, 
  filePath: string, 
  expiresIn: number = 3600
): Promise<string> {
  const provider = await getStorageProvider();

  try {
    return await provider.getUrl(bucket, filePath, expiresIn);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Storage] Signed URL error:', message);
    throw new Error(`Failed to create signed URL: ${message}`);
  }
}

// ============================================
// FILE VALIDATION
// ============================================

/**
 * Validate file extension
 */
export function validateFileExtension(fileName: string): boolean {
  const extension = '.' + fileName.split('.').pop()?.toLowerCase();
  return ALLOWED_FILE_EXTENSIONS.includes(extension as any);
}

/**
 * Validate file based on category
 */
export function validateFileForCategory(file: File, category: FileCategory): boolean {
  const sizeLimit = getFileSizeLimit(category);
  
  if (file.size > sizeLimit) {
    return false;
  }

  if (!validateFileExtension(file.name)) {
    return false;
  }

  return true;
}

/**
 * Get file size limit for a category
 */
export function getFileSizeLimit(category: FileCategory): number {
  switch (category) {
    case "graphics":
      return FILE_SIZE_LIMITS.IMAGE;
    case "documentation":
      return FILE_SIZE_LIMITS.DOCUMENT;
    case "source_code":
      return FILE_SIZE_LIMITS.DOCUMENT;
    case "audio":
      return FILE_SIZE_LIMITS.DOCUMENT;
    default:
      return FILE_SIZE_LIMITS.DOCUMENT;
  }
}

/**
 * Get file category from MIME type
 */
export function getFileCategoryFromMimeType(mimeType: string): FileCategory {
  if (ALLOWED_IMAGE_TYPES.includes(mimeType as any)) {
    return "graphics";
  }
  if (ALLOWED_DOCUMENT_TYPES.includes(mimeType as any)) {
    return "documentation";
  }
  if (ALLOWED_ARCHIVE_TYPES.includes(mimeType as any)) {
    return "source_code";
  }
  return "other";
}

// ============================================
// STORAGE USAGE
// ============================================

/**
 * Get project storage usage
 */
export async function getProjectStorageUsage(projectId: string): Promise<number> {
  // Was createClient() — the BROWSER client — inside a server-only module.
  // With no cookies it is unauthenticated, so RLS returned nothing and usage
  // was always 0, which silently disabled every storage quota check.
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('project_files')
    .select('size_bytes')
    .eq('project_id', projectId);

  if (error) {
    console.error('[Storage] Error fetching project storage:', error);
    return 0;
  }

  const totalBytes = data?.reduce((sum, file) => sum + (file.size_bytes || 0), 0) || 0;
  return totalBytes;
}

/**
 * Check if project is within storage quota
 */
export async function checkProjectStorageQuota(projectId: string): Promise<{ 
  withinQuota: boolean; 
  usedBytes: number; 
  quotaBytes: number; 
  percentage: number 
}> {
  const usedBytes = await getProjectStorageUsage(projectId);
  const quotaBytes = PROJECT_STORAGE_QUOTA;
  const percentage = (usedBytes / quotaBytes) * 100;
  
  return {
    withinQuota: usedBytes < quotaBytes,
    usedBytes,
    quotaBytes,
    percentage,
  };
}
