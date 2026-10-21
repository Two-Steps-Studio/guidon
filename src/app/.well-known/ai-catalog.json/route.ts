import { ardCatalog } from "@/lib/agent-discovery";
import { discoveryPreflight, discoveryResponse } from "@/lib/discovery-response";
import { SITE_URL } from "@/lib/site-url";

/** Agentic Resource Discovery catalog (src/lib/agent-discovery.ts) - under its older AI Catalog name, the same document. */
export function GET(request: Request) {
  return discoveryResponse(request, JSON.stringify(ardCatalog(SITE_URL), null, 2), "application/ai-catalog+json");
}

export { GET as HEAD };
export const OPTIONS = discoveryPreflight;
