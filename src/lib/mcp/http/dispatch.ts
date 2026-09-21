import { NextRequest } from "next/server";

/**
 * In-process dispatch from an MCP tool call to the existing /api/v1 route
 * handlers. The MCP endpoint deliberately contains no business logic of its
 * own: every tool builds a NextRequest for the matching v1 route, forwards the
 * caller's own Authorization header and lets that route enforce scopes, rate
 * limits, per-project AI permissions, RLS and actor attribution exactly as it
 * does for a direct API call.
 */

/** Tool result shape the MCP SDK accepts from a tool callback. */
export interface ToolResult {
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

interface CallOptions {
  /** URL path of the v1 route being called (used only to build the request). */
  path: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Record<string, string | undefined>;
  /** Sent as a JSON body when present. */
  body?: unknown;
}

export type Dispatch = <P = undefined>(
  handler: (request: NextRequest, context: { params: Promise<P> }) => Promise<Response>,
  params: P,
  options: CallOptions
) => Promise<ToolResult>;

/** Pulls the API's `{ error }` message out of a JSON error body, if there is one. */
function describeError(status: number, text: string): string {
  let message = text;
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object" && "error" in parsed && typeof parsed.error === "string") {
      message = parsed.error;
    }
  } catch {
    // Not JSON - keep the raw text.
  }
  return `Error (HTTP ${status}): ${message || "request failed"}`;
}

/**
 * Builds the dispatcher for one incoming MCP request. `origin` and
 * `authorization` come from that request; nothing is shared between requests.
 */
export function createDispatch(origin: string, authorization: string): Dispatch {
  return async (handler, params, options) => {
    const url = new URL(options.path, origin);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, value);
    }

    const headers = new Headers({ authorization });
    let body: string | undefined;
    if (options.body !== undefined) {
      headers.set("content-type", "application/json");
      body = JSON.stringify(options.body);
    }

    const response = await handler(new NextRequest(url, { method: options.method, headers, body }), {
      params: Promise.resolve(params),
    });
    const text = await response.text();

    if (!response.ok) {
      return { content: [{ type: "text", text: describeError(response.status, text) }], isError: true };
    }
    return { content: [{ type: "text", text: text || "OK" }] };
  };
}
