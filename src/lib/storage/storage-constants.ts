/**
 * Guidon Storage Constants
 * 
 * Defines storage buckets, file types, and size limits for Guidon.
 */

// ============================================
// STORAGE BUCKETS
// ============================================

export const STORAGE_BUCKETS = {
  FILES: "guidon-files",
  ATTACHMENTS: "guidon-attachments",
  EXPORTS: "guidon-exports",
} as const;

// ============================================
// FILE TYPE VALIDATION
// ============================================

export const ALLOWED_FILE_EXTENSIONS = [
  // Documents
  ".pdf",
  ".doc",
  ".docx",
  ".txt",
  ".md",
  ".rtf",
  ".odt",
  
  // Spreadsheets
  ".xls",
  ".xlsx",
  ".csv",
  
  // Presentations
  ".ppt",
  ".pptx",
  
  // Images
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".svg",
  ".ico",
  
  // Archives
  ".zip",
  ".rar",
  ".7z",
  ".tar",
  ".gz",
  
  // Code
  ".json",
  ".xml",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".env",
  
  // Other
  ".log",
] as const;

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/x-icon",
] as const;

export const ALLOWED_DOCUMENT_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
] as const;

export const ALLOWED_ARCHIVE_TYPES = [
  "application/zip",
  "application/x-rar-compressed",
  "application/x-7z-compressed",
  "application/x-tar",
  "application/gzip",
] as const;

// ============================================
// FILE SIZE LIMITS (in bytes)
// ============================================

export const FILE_SIZE_LIMITS = {
  IMAGE: 10 * 1024 * 1024, // 10MB
  DOCUMENT: 25 * 1024 * 1024, // 25MB
  ARCHIVE: 100 * 1024 * 1024, // 100MB
  ATTACHMENT: 50 * 1024 * 1024, // 50MB
  EXPORT: 200 * 1024 * 1024, // 200MB
} as const;

// ============================================
// PROJECT STORAGE QUOTAS
// ============================================

export const PROJECT_STORAGE_QUOTA = 5 * 1024 * 1024 * 1024; // 5GB per project
export const ORGANIZATION_STORAGE_QUOTA = 50 * 1024 * 1024 * 1024; // 50GB per organization

// ============================================
// FILE CATEGORIES
// ============================================

export const FILE_CATEGORIES = [
  "documentation",
  "graphics",
  "audio",
  "source_code",
  "other",
] as const;

export type FileCategory = typeof FILE_CATEGORIES[number];
