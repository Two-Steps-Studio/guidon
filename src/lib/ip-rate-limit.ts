import "server-only";

import { rateLimitHeaders } from "@/lib/api/api-route-core";

/**
 * Per-address sliding window for public, unauthenticated endpoints (docs
 * MCP server, /ask). In-memory and per process - the same accepted
 * trade-off as the API key limit (src/lib/api/rate-limit.ts). Every answer
 * carries the same RateLimit headers as /api/v1, so agents can pace
 * themselves without an account.
 */
const hits = new Map<string, number[]>();

export function clientAddress(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

export interface IpRateLimit {
  limited: boolean;
  headers: Record<string, string>;
}

/** Counts this request against `limit` per `windowMs` for its address. */
export function ipRateLimit(bucket: string, request: Request, limit: number, windowMs = 60_000): IpRateLimit {
  const key = `${bucket}:${clientAddress(request)}`;
  const now = Date.now();
  const since = now - windowMs;
  const recent = (hits.get(key) ?? []).filter((t) => t > since);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 10_000) {
    for (const [k, times] of hits) if (!times.some((t) => t > since)) hits.delete(k);
  }
  const limited = recent.length > limit;
  const resetSeconds = (recent[0] + windowMs - now) / 1000;
  const headers = rateLimitHeaders({ limit, remaining: limit - recent.length, resetSeconds }, windowMs / 1000);
  if (limited) headers["Retry-After"] = String(Math.max(1, Math.ceil(resetSeconds)));
  return { limited, headers };
}

/** The response with the rate-limit headers set. */
export function withHeaders(response: Response, headers: Record<string, string>): Response {
  for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
  return response;
}
