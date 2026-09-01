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

/**
 * For avatar/project-image uploads specifically, which are always public
 * (uploadFile(..., { public: true })) and served inline, unlike the signed,
 * forced-download URLs project files use (see the `download: true` fix in
 * providers/supabase.ts). SVG can embed a <script> that executes when its
 * URL is opened directly - forcing a download isn't an option for something
 * meant to render as an <img>, so it's excluded here instead of allowed
 * with a download flag. Deliberately a subset of ALLOWED_IMAGE_TYPES, not a
 * separate list - every entry here must also be safe as an inline document.
 */
export const SAFE_INLINE_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"] as const;

/**
 * Used only by /api/storage (the local-storage provider's serving route) to
 * pick a real Content-Type for a `public: true` object - the local provider
 * has nowhere to persist the Content-Type given at upload, so this derives
 * it from the file extension instead, safe only because SAFE_INLINE_IMAGE_TYPES
 * already restricts what extension an avatar/project/org image upload can
 * have gotten here with in the first place.
 */
export const SAFE_INLINE_EXTENSION_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

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
