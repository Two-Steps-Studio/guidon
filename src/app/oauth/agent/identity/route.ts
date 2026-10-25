import { NextRequest } from "next/server";
import { startAgentClaim } from "@/lib/oauth/agent-claims";
import { oauthJson, preflight } from "@/lib/oauth/http";
import { ipRateLimit, withHeaders } from "@/lib/ip-rate-limit";

export async function POST(request: NextRequest) {
  const rate = ipRateLimit("agent-identity", request, 10, 60 * 60 * 1000);
  const respond = (body: unknown, status = 200) => withHeaders(oauthJson(body, status), rate.headers);
  if (rate.limited) return respond({ error: "rate_limited" }, 429);
  if (!request.headers.get("content-type")?.includes("application/json")) return respond({ error: "invalid_request" }, 400);
  try {
    const reader = request.body?.getReader();
    if (!reader) return respond({ error: "invalid_request" }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16_384) { await reader.cancel(); return respond({ error: "invalid_request" }, 413); }
      chunks.push(value);
    }
    let parsed: unknown;
    try { parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { return respond({ error: "invalid_request" }, 400); }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return respond({ error: "invalid_request" }, 400);
    const input = Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
    const result = await startAgentClaim(input);
    return respond(result, "error" in result ? result.error === "temporarily_unavailable" ? 503 : 400 : 200);
  } catch {
    // Never log the email, user code or either bearer handle.
    return respond({ error: "server_error" }, 500);
  }
}
export const OPTIONS = preflight;
