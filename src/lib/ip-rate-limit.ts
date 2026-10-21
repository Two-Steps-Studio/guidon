import "server-only";

/**
 * Per-address sliding window for public, unauthenticated endpoints (docs
 * MCP server, /ask). In-memory and per process - the same accepted
 * trade-off as the API key limit (src/lib/api/rate-limit.ts).
 */
const hits = new Map<string, number[]>();

export function clientAddress(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

/** Counts this request; true when the address is over `limit` in the last `windowMs`. */
export function ipRateLimited(bucket: string, request: Request, limit: number, windowMs = 60_000): boolean {
  const key = `${bucket}:${clientAddress(request)}`;
  const since = Date.now() - windowMs;
  const recent = (hits.get(key) ?? []).filter((t) => t > since);
  recent.push(Date.now());
  hits.set(key, recent);
  if (hits.size > 10_000) {
    for (const [k, times] of hits) if (!times.some((t) => t > since)) hits.delete(k);
  }
  return recent.length > limit;
}
