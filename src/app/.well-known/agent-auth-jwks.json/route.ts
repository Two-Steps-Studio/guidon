import { agentSigningKey } from "@/lib/oauth/agent-claims-core";
import { discoveryPreflight } from "@/lib/discovery-response";

export const dynamic = "force-dynamic";
export function GET() {
  const key = agentSigningKey();
  return Response.json(key ? { keys: [key.publicJwk] } : { error: "Agent authentication is not configured." }, {
    status: key ? 200 : 404,
    headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": key ? "public, max-age=300" : "no-store" },
  });
}
export const OPTIONS = discoveryPreflight;
