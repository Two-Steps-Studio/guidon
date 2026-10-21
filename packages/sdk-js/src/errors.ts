/**
 * Every failure the SDK raises is a `GuidonError`: HTTP errors from the API
 * (status >= 400), network failures (`status: 0`, `code: "network_error"`),
 * timeouts (`code: "timeout"`) and responses that aren't the JSON the API
 * promises (`code: "invalid_response"`).
 */
export type GuidonErrorCode =
  | "invalid_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "method_not_allowed"
  | "conflict"
  | "length_required"
  | "payload_too_large"
  | "unsupported_media_type"
  | "unprocessable"
  | "rate_limited"
  | "internal_error"
  | "unavailable"
  | "network_error"
  | "timeout"
  | "aborted"
  | "invalid_response"
  // A machine-readable `code` the server sent in its error body.
  | (string & {});

export interface GuidonErrorInit {
  status: number;
  code: GuidonErrorCode;
  message: string;
  /** The parsed response body (JSON object, or raw text), if any. */
  body?: unknown;
  /** The server's "what to do now" for this error, if it sent one. */
  hint?: string;
  /** Link to the API docs the server sent with the error, if any. */
  docs?: string;
  /** Seconds from a `Retry-After` header (429/503), if the server sent one. */
  retryAfter?: number;
  requestId?: string;
  method?: string;
  url?: string;
  cause?: unknown;
}

export class GuidonError extends Error {
  override readonly name = "GuidonError";
  /** HTTP status; 0 when no response was received. */
  readonly status: number;
  readonly code: GuidonErrorCode;
  readonly body: unknown;
  readonly hint: string | undefined;
  readonly docs: string | undefined;
  readonly retryAfter: number | undefined;
  readonly requestId: string | undefined;
  readonly method: string | undefined;
  readonly url: string | undefined;

  constructor(init: GuidonErrorInit) {
    super(init.message, init.cause === undefined ? undefined : { cause: init.cause });
    this.status = init.status;
    this.code = init.code;
    this.body = init.body;
    this.hint = init.hint;
    this.docs = init.docs;
    this.retryAfter = init.retryAfter;
    this.requestId = init.requestId;
    this.method = init.method;
    this.url = init.url;
  }
}

export function isGuidonError(value: unknown): value is GuidonError {
  return value instanceof GuidonError;
}

/**
 * Default `code` for an HTTP status when the body doesn't carry one - the same
 * table the server uses for the codes it adds to its errors.
 */
const STATUS_CODES: Readonly<Record<number, GuidonErrorCode>> = {
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

export function codeForStatus(status: number): GuidonErrorCode {
  return STATUS_CODES[status] ?? (status >= 500 ? "internal_error" : "invalid_request");
}
