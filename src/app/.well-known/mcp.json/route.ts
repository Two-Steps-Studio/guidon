import { mcpManifest } from "@/lib/agent-discovery";
import { discoveryPreflight, discoveryResponse } from "@/lib/discovery-response";
import { SITE_URL } from "@/lib/site-url";

/**
 * The site's MCP manifest (src/lib/agent-discovery.ts's mcpManifest). The
 * same document is at /.well-known/mcp/manifest.json and /mcp.json - each a
 * place some scanner or registry reads first.
 */
export function GET(request: Request) {
  return discoveryResponse(request, JSON.stringify(mcpManifest(SITE_URL), null, 2), "application/json");
}

export { GET as HEAD };
export const OPTIONS = discoveryPreflight;
