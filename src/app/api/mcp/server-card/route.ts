import { mcpServerCard, SERVER_CARD_CONTENT_TYPE } from "@/lib/agent-discovery";
import { discoveryPreflight, discoveryResponse } from "@/lib/discovery-response";
import { SITE_URL } from "@/lib/site-url";

/** MCP server card of /api/mcp, at <server URL>/server-card as the extension recommends. */
export function GET(request: Request) {
  return discoveryResponse(request, JSON.stringify(mcpServerCard(SITE_URL), null, 2), SERVER_CARD_CONTENT_TYPE);
}

export { GET as HEAD };
export const OPTIONS = discoveryPreflight;
