import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { serviceDataClient } from "@/lib/data-client";
import { SITE_URL } from "@/lib/site-url";
import {
  IDEMPOTENCY_MAX_BODY,
  IDEMPOTENCY_TTL_MS,
  IDEMPOTENT_METHODS,
  enrichErrorBody,
  isValidIdempotencyKey,
  rateLimitHeaders,
  type RateLimitStatus,
} from "./api-route-core";
import { RATE_LIMIT_WINDOW_SECONDS } from "./rate-limit";
import { ipRateLimit } from "@/lib/ip-rate-limit";

/**
 * Wraps every /api/v1 route handler (`export const GET = apiRoute(...)`) with
 * what every response of the API shares, so no route has to remember it:
 *
 * - RateLimit headers (and Retry-After on a 429) from the per-key window the
 *   route's guardApiRequest just counted - noted through an
 *   AsyncLocalStorage store, since the guard runs inside the handler.
 * - JSON errors get a machine-readable `code`, a `hint` and a `docs` link
 *   (api-route-core.ts) next to the existing `error` message.
 * - Idempotency-Key on POST/PUT/PATCH/DELETE: the first response is stored
 *   for 24 hours (migration 072) and a retry with the same key gets it back
 *   (`Idempotent-Replayed: true`) instead of writing twice; the same key
 *   with a different request is a 422, one still running a 409.
 *
 * The MCP endpoint dispatches to these same exports, so tools get the same.
 */

interface RequestNotes {
  rate?: RateLimitStatus;
}

const notes = new AsyncLocalStorage<RequestNotes>();

/** Called by guardApiRequest once it has counted the request. */
export function noteRateLimit(status: RateLimitStatus): void {
  const store = notes.getStore();
  if (store) store.rate = status;
}

const DOCS_URL = `${SITE_URL}/developers#errors`;

function anonymousRate(request: NextRequest): RateLimitStatus {
  const { headers } = ipRateLimit("api-anonymous", request, ANONYMOUS_LIMIT);
  return {
    limit: ANONYMOUS_LIMIT,
    remaining: Number(headers["RateLimit-Remaining"]),
    resetSeconds: Number(headers["RateLimit-Reset"]),
  };
}

/** Requests per minute per address that carry no valid key. */
const ANONYMOUS_LIMIT = 60;

type Handler<C> = (request: NextRequest, context: C) => Promise<Response> | Response;

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export function apiRoute<C>(handler: Handler<C>): (request: NextRequest, context: C) => Promise<Response> {
  return (request, context) =>
    notes.run({}, async () => {
      const response = await withIdempotency(request, (forwarded) => handler(forwarded, context));
      // No key got as far as the per-key limit (401, bad id): the caller's
      // address has a window of its own, so every answer carries the headers.
      const rate = notes.getStore()?.rate ?? anonymousRate(request);
      return finish(response, rate);
    });
}

async function finish(response: Response, rate: RateLimitStatus | undefined): Promise<Response> {
  let out = response;

  if (response.status >= 400 && response.headers.get("content-type")?.includes("application/json")) {
    const text = await response.clone().text();
    try {
      const enriched = enrichErrorBody(JSON.parse(text), response.status, DOCS_URL);
      const headers = new Headers(response.headers);
      headers.delete("content-length");
      out = new Response(JSON.stringify(enriched), { status: response.status, statusText: response.statusText, headers });
    } catch {
      // Not JSON after all - leave it.
    }
  }

  if (rate) {
    for (const [name, value] of Object.entries(rateLimitHeaders(rate, RATE_LIMIT_WINDOW_SECONDS))) {
      out.headers.set(name, value);
    }
    if (out.status === 429) out.headers.set("Retry-After", String(Math.max(1, Math.ceil(rate.resetSeconds))));
  }
  return out;
}

function errorResponse(status: number, error: string, code: string): Response {
  return NextResponse.json(enrichErrorBody({ error, code }, status, DOCS_URL), { status });
}

async function withIdempotency(request: NextRequest, run: (request: NextRequest) => Promise<Response> | Response): Promise<Response> {
  const key = request.headers.get("idempotency-key");
  if (key === null || !IDEMPOTENT_METHODS.has(request.method)) return run(request);
  if (!isValidIdempotencyKey(key)) {
    return errorResponse(400, "Idempotency-Key must be 1-255 visible ASCII characters (a UUID works well).", "invalid_idempotency_key");
  }
  const authorization = request.headers.get("authorization");
  // No credentials: the route answers 401 anyway, nothing to make idempotent.
  if (!authorization) return run(request);

  // The body is read here to fingerprint the request, so the handler gets a
  // copy built from the same bytes.
  const body = request.body ? await request.text() : "";
  const forwarded = new NextRequest(request.url, {
    method: request.method,
    headers: request.headers,
    body: body.length ? body : undefined,
  });

  const scope = sha256(authorization);
  const requestHash = sha256(`${request.method} ${request.nextUrl.pathname}${request.nextUrl.search}\n${body}`);
  const db = serviceDataClient();

  const { data: existing } = await db
    .from("api_idempotency_keys")
    .select("request_hash, status_code, response_body, response_type, created_at")
    .eq("scope", scope)
    .eq("idempotency_key", key)
    .maybeSingle();

  if (existing) {
    const row = existing as {
      request_hash: string;
      status_code: number | null;
      response_body: string | null;
      response_type: string | null;
      created_at: string;
    };
    if (Date.now() - Date.parse(row.created_at) > IDEMPOTENCY_TTL_MS) {
      await db.from("api_idempotency_keys").delete().eq("scope", scope).eq("idempotency_key", key);
    } else if (row.request_hash !== requestHash) {
      return errorResponse(422, "This Idempotency-Key was already used for a different request.", "idempotency_key_reused");
    } else if (row.status_code === null) {
      return errorResponse(409, "A request with this Idempotency-Key is still being processed.", "idempotency_in_progress");
    } else {
      return new Response(row.response_body ?? "", {
        status: row.status_code,
        headers: {
          ...(row.response_type ? { "Content-Type": row.response_type } : {}),
          "Idempotent-Replayed": "true",
        },
      });
    }
  }

  const { error: claimError } = await db
    .from("api_idempotency_keys")
    .insert({ scope, idempotency_key: key, request_hash: requestHash });
  if (claimError) {
    // Lost a race with a concurrent request carrying the same key - or the
    // table is missing (072 not run yet): then just run without the guarantee.
    if (/duplicate key|23505|unique/i.test(claimError.message)) {
      return errorResponse(409, "A request with this Idempotency-Key is still being processed.", "idempotency_in_progress");
    }
    console.error("[api] Idempotency-Key not stored:", claimError.message);
    return run(forwarded);
  }

  let response: Response;
  try {
    response = await run(forwarded);
  } catch (error) {
    await db.from("api_idempotency_keys").delete().eq("scope", scope).eq("idempotency_key", key);
    throw error;
  }

  // Server errors aren't final - free the key so a retry runs again. The
  // same for a response too big to keep.
  const text = response.status >= 500 ? null : await response.clone().text();
  if (text === null || text.length > IDEMPOTENCY_MAX_BODY) {
    await db.from("api_idempotency_keys").delete().eq("scope", scope).eq("idempotency_key", key);
    return response;
  }
  await db
    .from("api_idempotency_keys")
    .update({ status_code: response.status, response_body: text, response_type: response.headers.get("content-type") })
    .eq("scope", scope)
    .eq("idempotency_key", key);

  // Opportunistic cleanup of this client's expired keys.
  await db
    .from("api_idempotency_keys")
    .delete()
    .eq("scope", scope)
    .lt("created_at", new Date(Date.now() - IDEMPOTENCY_TTL_MS).toISOString());

  return response;
}
