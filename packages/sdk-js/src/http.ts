import { GuidonError, codeForStatus } from "./errors.js";
import { VERSION } from "./version.js";

export const DEFAULT_BASE_URL = "https://useguidon.com";
const API_PREFIX = "/api/v1";

export interface GuidonOptions {
  /**
   * A Guidon API key (`guidon_...`, from Profile -> API keys). Falls back to
   * the `GUIDON_API_KEY` environment variable when running under Node.
   */
  apiKey?: string;
  /**
   * The Guidon instance, e.g. `https://useguidon.com` (default) or a
   * self-hosted `https://guidon.example.com`. `/api/v1` is appended unless
   * already present. Falls back to `GUIDON_BASE_URL` under Node.
   */
  baseUrl?: string;
  /** Per-request timeout in milliseconds. Default 30 000; 0 disables it. */
  timeoutMs?: number;
  /**
   * How many times to retry a request that failed with 429, 502, 503, 504, a
   * network error, or 409 `idempotency_in_progress`. Only safe requests are retried: GETs, and writes that
   * carry an `idempotencyKey`. Default 2.
   */
  maxRetries?: number;
  /** A custom fetch implementation (tests, proxies). Defaults to the global `fetch`. */
  fetch?: typeof fetch;
  /** Extra headers sent with every request. */
  headers?: Record<string, string>;
  /** Appended to the SDK's User-Agent, e.g. `my-agent/1.2`. */
  userAgent?: string;
}

export interface RequestOptions {
  signal?: AbortSignal;
  /** Overrides the client's timeout for this request. */
  timeoutMs?: number;
  /** Extra headers for this request. */
  headers?: Record<string, string>;
}

export interface WriteOptions extends RequestOptions {
  /**
   * Sent as the `Idempotency-Key` header. Reuse the same key when retrying
   * the same logical write so the server can apply it at most once; it also
   * lets the SDK retry the write automatically on 429/5xx/network errors.
   */
  idempotencyKey?: string;
}

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export interface RawRequest extends WriteOptions {
  query?: Record<string, string | number | boolean | undefined>;
  /** JSON-serialised unless it is a FormData. */
  body?: unknown;
  /** `json` (default) parses the response as JSON; `text` returns it as a string. */
  responseType?: "json" | "text";
}

function env(name: string): string | undefined {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  const value = proc?.env?.[name];
  return value ? value : undefined;
}

/** `https://host/` or `https://host/api/v1/` -> `https://host/api/v1`. */
export function normalizeBaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new GuidonError({ status: 0, code: "invalid_base_url", message: `Invalid Guidon base URL: ${raw}` });
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new GuidonError({ status: 0, code: "invalid_base_url", message: `Guidon base URL must be http(s): ${raw}` });
  }
  let path = url.pathname.replace(/\/+$/, "");
  if (!path.endsWith(API_PREFIX)) path += API_PREFIX;
  return `${url.origin}${path}`;
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, (date - Date.now()) / 1000);
}

const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });

/** The transport every resource goes through: auth, JSON, errors, retries. */
export class HttpClient {
  readonly baseUrl: string;
  readonly #apiKey: string;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;
  readonly #maxRetries: number;
  readonly #headers: Record<string, string>;

  constructor(options: GuidonOptions = {}) {
    const apiKey = options.apiKey ?? env("GUIDON_API_KEY");
    if (!apiKey) {
      throw new GuidonError({
        status: 0,
        code: "missing_api_key",
        message: "No Guidon API key. Pass { apiKey } or set GUIDON_API_KEY (create one in Profile -> API keys).",
      });
    }
    const fetchImpl = options.fetch ?? (globalThis.fetch as typeof fetch | undefined);
    if (!fetchImpl) {
      throw new GuidonError({ status: 0, code: "no_fetch", message: "No global fetch - use Node 18+ or pass { fetch }." });
    }
    this.#apiKey = apiKey;
    this.#fetch = fetchImpl;
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? env("GUIDON_BASE_URL") ?? DEFAULT_BASE_URL);
    this.#timeoutMs = options.timeoutMs ?? 30_000;
    this.#maxRetries = Math.max(0, options.maxRetries ?? 2);
    this.#headers = {
      "User-Agent": `guidon-sdk-js/${VERSION}${options.userAgent ? ` ${options.userAgent}` : ""}`,
      ...options.headers,
    };
  }

  url(path: string, query?: RawRequest["query"]): string {
    const url = new URL(this.baseUrl + path);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  async request<T>(method: HttpMethod, path: string, req: RawRequest = {}): Promise<T> {
    const url = this.url(path, req.query);
    const headers: Record<string, string> = {
      Accept: req.responseType === "text" ? "text/markdown, text/plain, application/json" : "application/json",
      ...this.#headers,
      ...req.headers,
      Authorization: `Bearer ${this.#apiKey}`,
    };
    let body: BodyInit | undefined;
    if (req.body instanceof FormData) {
      body = req.body; // fetch sets the multipart boundary and length
    } else if (req.body !== undefined) {
      body = JSON.stringify(req.body);
      headers["Content-Type"] = "application/json";
    }
    if (req.idempotencyKey) headers["Idempotency-Key"] = req.idempotencyKey;

    const retryable = method === "GET" || Boolean(req.idempotencyKey);
    const maxAttempts = retryable ? this.#maxRetries + 1 : 1;

    for (let attempt = 1; ; attempt++) {
      let response: Response;
      const timeoutMs = req.timeoutMs ?? this.#timeoutMs;
      const controller = new AbortController();
      let timedOut = false;
      const timer =
        timeoutMs > 0
          ? setTimeout(() => {
              timedOut = true;
              controller.abort();
            }, timeoutMs)
          : undefined;
      const onAbort = () => controller.abort(req.signal?.reason);
      if (req.signal?.aborted) onAbort();
      else req.signal?.addEventListener("abort", onAbort, { once: true });

      try {
        response = await this.#fetch(url, { method, headers, body, signal: controller.signal });
      } catch (cause) {
        clearTimeout(timer);
        req.signal?.removeEventListener("abort", onAbort);
        if (req.signal?.aborted) {
          throw new GuidonError({ status: 0, code: "aborted", message: "Request aborted.", method, url, cause });
        }
        const error = timedOut
          ? new GuidonError({ status: 0, code: "timeout", message: `Request timed out after ${timeoutMs} ms.`, method, url, cause })
          : new GuidonError({
              status: 0,
              code: "network_error",
              message: `Could not reach Guidon at ${this.baseUrl}: ${(cause as Error)?.message ?? String(cause)}`,
              method,
              url,
              cause,
            });
        if (attempt < maxAttempts) {
          await sleep(this.#backoff(attempt), req.signal);
          continue;
        }
        throw error;
      }

      try {
        if (response.ok) return (await this.#readSuccess<T>(response, req, method, url)) as T;
        const error = await this.#readError(response, method, url);
        // 409 idempotency_in_progress: the first request with this key is still running.
        const retryableError =
          RETRYABLE_STATUS.has(response.status) || (response.status === 409 && error.code === "idempotency_in_progress");
        if (attempt < maxAttempts && retryableError) {
          const wait = error.retryAfter !== undefined ? error.retryAfter * 1000 : this.#backoff(attempt);
          await sleep(Math.min(wait, 60_000), req.signal);
          continue;
        }
        throw error;
      } finally {
        clearTimeout(timer);
        req.signal?.removeEventListener("abort", onAbort);
      }
    }
  }

  #backoff(attempt: number): number {
    const base = Math.min(8_000, 500 * 2 ** (attempt - 1));
    return base / 2 + Math.random() * (base / 2);
  }

  async #readSuccess<T>(response: Response, req: RawRequest, method: string, url: string): Promise<T | string | undefined> {
    const text = await response.text();
    if (req.responseType === "text") return text;
    if (!text) return undefined;
    try {
      return JSON.parse(text) as T;
    } catch (cause) {
      throw new GuidonError({
        status: response.status,
        code: "invalid_response",
        message: `Expected JSON from ${method} ${url}, got ${response.headers.get("content-type") ?? "an unknown content type"}.`,
        body: text.slice(0, 2000),
        method,
        url,
        cause,
      });
    }
  }

  async #readError(response: Response, method: string, url: string): Promise<GuidonError> {
    let body: unknown;
    let text = "";
    try {
      text = await response.text();
      body = text ? JSON.parse(text) : undefined;
    } catch {
      body = text || undefined;
    }
    const record = body && typeof body === "object" ? (body as Record<string, unknown>) : undefined;
    const serverMessage =
      typeof record?.error === "string"
        ? record.error
        : typeof (record?.error as { message?: unknown } | undefined)?.message === "string"
          ? String((record!.error as { message: string }).message)
          : typeof record?.message === "string"
            ? record.message
            : undefined;
    const code = typeof record?.code === "string" && record.code ? record.code : codeForStatus(response.status);
    const str = (value: unknown) => (typeof value === "string" && value ? value : undefined);
    return new GuidonError({
      status: response.status,
      code,
      hint: str(record?.hint),
      docs: str(record?.docs),
      message: serverMessage ?? `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`,
      body,
      retryAfter: parseRetryAfter(response.headers.get("retry-after")),
      requestId: response.headers.get("x-request-id") ?? response.headers.get("x-vercel-id") ?? undefined,
      method,
      url,
    });
  }
}
