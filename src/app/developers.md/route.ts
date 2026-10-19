import { MARKDOWN_CONTENT_TYPE, withFrontmatter } from "@/lib/agent-web";
import { developersMarkdown } from "@/lib/developers-doc";
import { SITE_URL } from "@/lib/site-url";

// Markdown twin of /developers (src/proxy.ts serves it there to agents).
export const dynamic = "force-static";

export function GET() {
  const body = withFrontmatter(developersMarkdown(SITE_URL), {
    title: "Guidon for developers and AI agents",
    description: "API keys and scopes, the MCP server, REST endpoints, OpenAPI and errors.",
    canonical: `${SITE_URL}/developers`,
  });
  return new Response(body, { headers: { "Content-Type": MARKDOWN_CONTENT_TYPE, Vary: "Accept" } });
}
