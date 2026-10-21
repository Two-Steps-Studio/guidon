import { mcpServerCard, SERVER_CARD_CONTENT_TYPE } from "@/lib/agent-discovery";
import { discoveryPreflight, discoveryResponse } from "@/lib/discovery-response";
import { SITE_URL } from "@/lib/site-url";

/**
 * The product MCP server's card at the site-level address some registries
 * and scanners read first (the server-card extension still reads it for a
 * site's main server). The same card is at /api/mcp/server-card, the
 * recommended place, and both are listed in /.well-known/ard.json.
 */
export function GET(request: Request) {
  return discoveryResponse(request, JSON.stringify(mcpServerCard(SITE_URL), null, 2), SERVER_CARD_CONTENT_TYPE);
}

export { GET as HEAD };
export const OPTIONS = discoveryPreflight;
