/**
 * Validation and formatting for in-game reports (POST
 * /api/v1/projects/[projectId]/reports) - kept free of imports so the
 * rules can be tested with plain `node` (tests/game-report.test.mjs), the
 * same way the other tests in tests/ exercise pure modules.
 *
 * A report's API key ships inside a game build given to testers or players,
 * so everything here assumes hostile input: every field is length-capped,
 * the metadata table is escaped, and only a short list of file types is
 * accepted - screenshots and logs, nothing executable or renderable.
 */

export const REPORT_CATEGORIES = ["bug", "crash", "feedback"] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export const REPORT_LIMITS = {
  titleLength: 200,
  descriptionLength: 10_000,
  reporterLength: 200,
  metadataEntries: 40,
  metadataKeyLength: 64,
  metadataValueLength: 500,
  files: 3,
  fileBytes: 10 * 1024 * 1024,
  fileNameLength: 120,
} as const;

/** Screenshots and logs only - no SVG (can carry script) and no archives. */
export const REPORT_FILE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".txt", ".log", ".json"] as const;

export interface ReportFileInfo {
  name: string;
  size: number;
}

export interface ParsedReport {
  title: string;
  description: string;
  category: ReportCategory;
  tags: string[];
}

export type ReportResult<T> = { ok: true; value: T } | { ok: false; error: string };

const CATEGORY_PREFIX: Record<ReportCategory, string> = {
  bug: "[Bug]",
  crash: "[Crash]",
  feedback: "[Feedback]",
};

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** One line, no control characters - for titles, names and table cells. */
function singleLine(value: string): string {
  let out = "";
  for (const char of value) {
    const code = char.charCodeAt(0);
    out += code < 32 || code === 127 ? " " : char;
  }
  return out.replace(/\s+/g, " ").trim();
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max - 1) + "\u2026" : value;
}

/** Escapes a value for a Markdown table cell. */
function cell(value: string): string {
  return singleLine(value).replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/`/g, "\\`");
}

/**
 * Parses the `metadata` form field: a JSON object of short string/number/
 * boolean values (build version, platform, scene, position...). Anything
 * else - nested objects, arrays, too many entries - is rejected rather than
 * silently dropped, so a game developer notices during integration.
 */
export function parseMetadata(raw: unknown): ReportResult<Array<[string, string]>> {
  const text = asString(raw).trim();
  if (!text) return { ok: true, value: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "metadata must be a JSON object." };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "metadata must be a JSON object." };
  }

  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length > REPORT_LIMITS.metadataEntries) {
    return { ok: false, error: `metadata may have at most ${REPORT_LIMITS.metadataEntries} entries.` };
  }

  const rows: Array<[string, string]> = [];
  for (const [key, value] of entries) {
    if (!["string", "number", "boolean"].includes(typeof value)) {
      return { ok: false, error: `metadata.${truncate(key, 40)} must be a string, number or boolean.` };
    }
    const cleanKey = truncate(singleLine(key), REPORT_LIMITS.metadataKeyLength);
    if (!cleanKey) continue;
    rows.push([cleanKey, truncate(singleLine(String(value)), REPORT_LIMITS.metadataValueLength)]);
  }
  return { ok: true, value: rows };
}

/** Builds the task title/description/tags from the report's text fields. */
export function buildReport(fields: {
  title: unknown;
  description?: unknown;
  category?: unknown;
  reporter?: unknown;
  metadata?: unknown;
}): ReportResult<ParsedReport> {
  const rawTitle = truncate(singleLine(asString(fields.title)), REPORT_LIMITS.titleLength);
  if (!rawTitle) return { ok: false, error: "title is required." };

  const categoryInput = asString(fields.category).trim().toLowerCase();
  const category: ReportCategory = (REPORT_CATEGORIES as readonly string[]).includes(categoryInput)
    ? (categoryInput as ReportCategory)
    : "bug";

  const metadata = parseMetadata(fields.metadata);
  if (!metadata.ok) return metadata;

  const body = truncate(asString(fields.description).trim(), REPORT_LIMITS.descriptionLength);
  const reporter = truncate(singleLine(asString(fields.reporter)), REPORT_LIMITS.reporterLength);

  const parts: string[] = [];
  if (body) parts.push(body, "");
  parts.push("---", `Reported from the game${reporter ? ` by **${cell(reporter)}**` : ""}.`);
  if (metadata.value.length > 0) {
    parts.push("", "| Field | Value |", "|---|---|");
    for (const [key, value] of metadata.value) parts.push(`| ${cell(key)} | ${cell(value)} |`);
  }

  return {
    ok: true,
    value: {
      title: `${CATEGORY_PREFIX[category]} ${rawTitle}`,
      description: parts.join("\n"),
      category,
      tags: [category, "in-game"],
    },
  };
}

/** Checks the attached files before anything is created. Returns the cleaned file names in order. */
export function validateReportFiles(files: ReportFileInfo[]): ReportResult<string[]> {
  if (files.length > REPORT_LIMITS.files) {
    return { ok: false, error: `At most ${REPORT_LIMITS.files} files per report.` };
  }
  const names: string[] = [];
  for (const file of files) {
    const clean = singleLine(file.name).replace(/[\\/]/g, "_");
    const dot = clean.lastIndexOf(".");
    const extension = dot >= 0 ? clean.slice(dot).toLowerCase() : "";
    // Shorten the stem, never the extension.
    const name = truncate(dot >= 0 ? clean.slice(0, dot) : clean, REPORT_LIMITS.fileNameLength - extension.length) + extension;
    if (!(REPORT_FILE_EXTENSIONS as readonly string[]).includes(extension)) {
      return { ok: false, error: `${name || "file"}: only ${REPORT_FILE_EXTENSIONS.join(", ")} files are accepted.` };
    }
    if (file.size <= 0) return { ok: false, error: `${name}: file is empty.` };
    if (file.size > REPORT_LIMITS.fileBytes) {
      return { ok: false, error: `${name}: file is larger than ${REPORT_LIMITS.fileBytes / (1024 * 1024)}MB.` };
    }
    names.push(name);
  }
  return { ok: true, value: names };
}
