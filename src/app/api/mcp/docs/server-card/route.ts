import { mcpServerCard, SERVER_CARD_CONTENT_TYPE } from "@/lib/agent-discovery";
import { discoveryPreflight, discoveryResponse } from "@/lib/discovery-response";
import { SITE_URL } from "@/lib/site-url";

/** MCP server card of the public docs server /api/mcp/docs. */
export function GET(request: Request) {
  return discoveryResponse(request, JSON.stringify(mcpServerCard(SITE_URL, true), null, 2), SERVER_CARD_CONTENT_TYPE);
}

export { GET as HEAD };
export const OPTIONS = discoveryPreflight;
