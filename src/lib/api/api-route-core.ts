// No imports: loaded by tests/api-route.test.mjs with Node's type stripping.

/**
 * The parts of src/lib/api/api-route.ts that are plain functions: error
 * codes, rate-limit headers, Idempotency-Key rules and list cursors.
 */

/** Machine-readable `code` added to every JSON error that doesn't carry one. */
export const ERROR_CODES: Readonly<Record<number, string>> = {
  400: "invalid_request",
  401: "unauthorized",
  403: "forbidden",
  404: "not_found",
  405: "method_not_allowed",
  409: "conflict",
  411: "length_required",
  413: "payload_too_large",
  415: "unsupported_media_type",
  422: "unprocessable",
  429: "rate_limited",
  500: "internal_error",
  503: "unavailable",
};

export function errorCodeFor(status: number): string {
  return ERROR_CODES[status] ?? (status >= 500 ? "internal_error" : "invalid_request");
}

/** A short "what to do now" for each code, so an agent doesn't have to guess. */
const HINTS: Readonly<Record<string, string>> = {
  unauthorized: "Send a valid API key: Authorization: Bearer guidon_... (Profile -> API keys).",
  forbidden: "The key lacks the scope or the user lacks the role for this. Check the key's scopes and the user's project role.",
  not_found: "Check the id. Projects and tasks the key's user can't see also answer 404.",
  rate_limited: "Wait for the number of seconds in Retry-After, then retry.",
  conflict: "The same Idempotency-Key is still being processed. Retry after a moment.",
  unprocessable: "Use a new Idempotency-Key for a different request.",
  internal_error: "Retry later with the same Idempotency-Key; if it keeps failing, contact support.",
};

/**
 * `{ error }` -> `{ error, code, hint, docs }`. Fields the route already set
 * win; non-error or non-object bodies come back unchanged.
 */
export function enrichErrorBody(body: unknown, status: number, docsUrl: string): unknown {
  if (status < 400 || !body || typeof body !== "object" || Array.isArray(body)) return body;
  const record = body as Record<string, unknown>;
  if (typeof record.error !== "string") return body;
  const code = typeof record.code === "string" ? record.code : errorCodeFor(status);
  const hint = HINTS[code];
  return { ...record, code, ...(hint && record.hint === undefined ? { hint } : {}), docs: record.docs ?? docsUrl };
}

export interface RateLimitStatus {
  limit: number;
  remaining: number;
  /** Seconds until the window resets. */
  resetSeconds: number;
}

/**
 * Both the IETF draft's structured fields (RateLimit-Policy / RateLimit)
 * and the widely read RateLimit-Limit/-Remaining/-Reset trio.
 */
export function rateLimitHeaders(status: RateLimitStatus, windowSeconds: number): Record<string, string> {
  const remaining = Math.max(0, status.remaining);
  const reset = Math.max(0, Math.ceil(status.resetSeconds));
  return {
    "RateLimit-Policy": `"default";q=${status.limit};w=${windowSeconds}`,
    RateLimit: `"default";r=${remaining};t=${reset}`,
    "RateLimit-Limit": String(status.limit),
    "RateLimit-Remaining": String(remaining),
    "RateLimit-Reset": String(reset),
  };
}

/** Visible ASCII, 1-255 characters - a UUID is the usual choice. */
export function isValidIdempotencyKey(key: string): boolean {
  return /^[\x21-\x7e]{1,255}$/.test(key);
}

export const IDEMPOTENT_METHODS: ReadonlySet<string> = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** How long a stored response is replayed. */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

/** Larger responses aren't stored (a retry then runs again). */
export const IDEMPOTENCY_MAX_BODY = 512 * 1024;

export interface ListCursor {
  /** id of the last row of the previous page. */
  id: string;
  /** Its created_at (ISO), used only if that row has been deleted since. */
  createdAt: string;
}

/** Opaque to clients: base64url of "<id>|<created_at>". */
export function encodeCursor(cursor: ListCursor): string {
  return Buffer.from(`${cursor.id}|${cursor.createdAt}`, "utf8").toString("base64url");
}

export function decodeCursor(value: string | null | undefined): ListCursor | null {
  if (!value) return null;
  const [id, createdAt, ...rest] = Buffer.from(value, "base64url").toString("utf8").split("|");
  if (rest.length || !id || !createdAt || Number.isNaN(Date.parse(createdAt))) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  return { id, createdAt };
}

/**
 * Splits `limit + 1` fetched rows into the page and the cursor for the next
 * one (null when this is the last page). created_at is a Date from a direct
 * Postgres connection, a string from PostgREST.
 */
export function toPage<T extends { created_at: string | Date; id: string }>(
  rows: T[],
  limit: number
): { items: T[]; nextCursor: string | null } {
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  const nextCursor =
    rows.length > limit && last ? encodeCursor({ id: last.id, createdAt: new Date(last.created_at).toISOString() }) : null;
  return { items, nextCursor };
}

/** `?limit=` within [1, max], `fallback` when absent or not a number. */
export function parseLimit(value: string | null, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!value || !Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(parsed)));
}
