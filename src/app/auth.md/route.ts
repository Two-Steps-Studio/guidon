import { MARKDOWN_CONTENT_TYPE, withFrontmatter } from "@/lib/agent-web";
import { authMarkdown } from "@/lib/oauth/oauth-core";
import { SITE_URL } from "@/lib/site-url";

// How agents get credentials (OAuth 2.1 or an API key) - linked from the
// authorization server metadata's service_documentation and llms.txt.
export const dynamic = "force-static";

export function GET() {
  const body = withFrontmatter(authMarkdown(SITE_URL), {
    title: "Authenticating to Guidon",
    description: "OAuth 2.1 with PKCE for MCP clients and apps, or a personal API key.",
    canonical: `${SITE_URL}/auth.md`,
  });
  return new Response(body, { headers: { "Content-Type": MARKDOWN_CONTENT_TYPE, "Access-Control-Allow-Origin": "*" } });
}
