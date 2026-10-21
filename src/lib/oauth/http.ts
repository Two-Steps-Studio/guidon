import "server-only";

import { NextRequest, NextResponse } from "next/server";

/**
 * Shared bits of the OAuth endpoints: CORS (browser-based MCP clients call
 * them cross-origin, and they need no cookies), no-store on anything with a
 * token in it, and reading a body that may be form-encoded (the standard)
 * or JSON (some clients).
 */
export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

export function preflight() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function oauthJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { ...CORS_HEADERS, "Cache-Control": "no-store", Pragma: "no-cache" },
  });
}

/** Form (application/x-www-form-urlencoded) or JSON body as string fields; null when unreadable. */
export async function readParams(request: NextRequest): Promise<Record<string, string> | null> {
  const type = request.headers.get("content-type") ?? "";
  try {
    if (type.includes("application/json")) {
      const body = (await request.json()) as Record<string, unknown>;
      if (!body || typeof body !== "object") return null;
      return Object.fromEntries(Object.entries(body).filter(([, v]) => typeof v === "string")) as Record<string, string>;
    }
    const form = new URLSearchParams(await request.text());
    return Object.fromEntries(form.entries());
  } catch {
    return null;
  }
}

/**
 * Client credentials, if a client sends them anyway: Guidon's clients are
 * public, so a secret is never checked - but the client_id in HTTP Basic
 * counts, so such a client still works.
 */
export function clientIdFrom(request: NextRequest, params: Record<string, string>): string {
  if (params.client_id) return params.client_id;
  const basic = request.headers.get("authorization");
  if (basic?.startsWith("Basic ")) {
    try {
      const decoded = Buffer.from(basic.slice(6), "base64").toString("utf8");
      return decodeURIComponent(decoded.split(":")[0] ?? "");
    } catch {
      return "";
    }
  }
  return "";
}

const registrations = new Map<string, number[]>();
const REGISTRATIONS_PER_HOUR = 30;

/**
 * Dynamic registration is open to anyone (that's its point) - capped per
 * address so it can't fill the table. In-memory, per process: the same
 * accepted trade-off as the API key rate limit.
 */
export function registrationLimited(request: NextRequest): boolean {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const hourAgo = Date.now() - 60 * 60 * 1000;
  const recent = (registrations.get(ip) ?? []).filter((t) => t > hourAgo);
  if (recent.length >= REGISTRATIONS_PER_HOUR) return true;
  recent.push(Date.now());
  registrations.set(ip, recent);
  return false;
}
