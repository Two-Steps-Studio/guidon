// ============================================
// PROJECT FILE TYPES
// ============================================

// ProjectFile already lives in @/types/api — re-exported here so preview code
// has one import, without introducing a second, drifting definition.
export type { ProjectFile } from "@/types/api";

/**
 * How a file should be previewed. Distinct from `category`, which is what the
 * user filed it under — a .png can be filed as `documentation` and still needs
 * to render as an image.
 */
export type FileKind =
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "code"
  | "text"
  | "other";

const EXTENSIONS: Record<Exclude<FileKind, "other">, string[]> = {
  image: ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp", "ico"],
  video: ["mp4", "webm", "mov", "m4v", "ogv"],
  audio: ["mp3", "wav", "ogg", "flac", "m4a", "aac"],
  pdf: ["pdf"],
  code: [
    "ts", "tsx", "js", "jsx", "mjs", "cjs", "json", "css", "scss", "html",
    "py", "rb", "go", "rs", "java", "kt", "swift", "c", "h", "cpp", "hpp",
    "cs", "php", "sh", "bash", "sql", "yml", "yaml", "toml", "xml", "lua",
    "glsl", "hlsl", "shader", "gradle", "dockerfile",
  ],
  text: ["txt", "md", "markdown", "log", "csv", "rst", "ini", "env"],
};

/** Prism language id for a file extension, or `text` when unknown. */
const LANGUAGE_ALIASES: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  mjs: "javascript",
  cjs: "javascript",
  py: "python",
  rb: "ruby",
  rs: "rust",
  kt: "kotlin",
  cs: "csharp",
  sh: "bash",
  yml: "yaml",
  h: "c",
  hpp: "cpp",
  shader: "glsl",
  dockerfile: "docker",
};

export function fileExtension(name: string): string {
  const parts = name.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "";
}

/**
 * Decide how to render a file. The MIME type is trusted first because it is
 * set by the browser at upload; the extension is the fallback, since
 * `mime_type` is nullable in the schema.
 */
export function detectFileKind(file: {
  name: string;
  mime_type?: string | null;
}): FileKind {
  const mime = file.mime_type ?? "";

  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf") return "pdf";

  const ext = fileExtension(file.name);

  for (const [kind, list] of Object.entries(EXTENSIONS)) {
    if (list.includes(ext)) return kind as FileKind;
  }

  // Some text formats arrive as text/* without a helpful extension.
  if (mime.startsWith("text/")) return "text";

  return "other";
}

export function prismLanguage(name: string): string {
  const ext = fileExtension(name);
  return LANGUAGE_ALIASES[ext] ?? ext ?? "text";
}

/** Guard for previews that must not stream very large files into memory. */
export const MAX_INLINE_PREVIEW_BYTES = 2 * 1024 * 1024;

export function formatFileSize(bytes: number | null): string {
  if (bytes === null || Number.isNaN(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;

  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}
