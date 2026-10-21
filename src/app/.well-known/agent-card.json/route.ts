import { a2aAgentCard } from "@/lib/agent-discovery";
import { discoveryPreflight, discoveryResponse } from "@/lib/discovery-response";
import { SITE_URL } from "@/lib/site-url";

/** A2A Agent Card of the docs agent (/api/a2a). */
export function GET(request: Request) {
  return discoveryResponse(request, JSON.stringify(a2aAgentCard(SITE_URL), null, 2), "application/json");
}

export { GET as HEAD };
export const OPTIONS = discoveryPreflight;
