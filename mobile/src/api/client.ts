/**
 * The one place that talks HTTP. Every call carries the API key as a Bearer
 * token; errors come back as ApiError with the server's own `{ error }` text.
 */

export const DEFAULT_SERVER = "https://useguidon.com";
const TIMEOUT_MS = 20_000;

type Credentials = { server: string; apiKey: string | null };

let credentials: Credentials = { server: DEFAULT_SERVER, apiKey: null };

/** Set by the session provider whenever the signed-in account changes. */
export function setApiCredentials(next: Credentials): void {
  credentials = next;
}

export function getApiServer(): string {
  return credentials.server;
}

export class ApiError extends Error {
  /** HTTP status; 0 = the request never got an answer (offline, DNS, timeout). */
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }

  get isNetwork(): boolean {
    return this.status === 0;
  }
  get isUnauthorized(): boolean {
    return this.status === 401;
  }
  get isRateLimited(): boolean {
    return this.status === 429;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/**
 * Normalises what a person types into a server origin: adds https:// when no
 * scheme is given, drops paths and trailing slashes. Null when it isn't a URL.
 */
export function normalizeServerUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname) return null;
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** Skip the Authorization header (the token exchange has no key yet). */
  anonymous?: boolean;
  /** Override the server (sign-in runs before credentials are stored). */
  server?: string;
};

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const server = options.server ?? credentials.server;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (!options.anonymous) {
    if (!credentials.apiKey) throw new ApiError(401, "Not signed in.");
    headers.Authorization = `Bearer ${credentials.apiKey}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${server}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch (error) {
    throw new ApiError(0, error instanceof Error ? error.message : "Network request failed.");
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }

  if (!response.ok) {
    const message =
      json && typeof json === "object" && "error" in json && typeof (json as { error: unknown }).error === "string"
        ? (json as { error: string }).error
        : `Request failed (${response.status}).`;
    throw new ApiError(response.status, message);
  }
  if (json === null) throw new ApiError(response.status, "The server sent an unexpected response.");
  return json as T;
}
