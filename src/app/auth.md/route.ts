import { MARKDOWN_CONTENT_TYPE } from "@/lib/agent-web";
import { authMarkdown } from "@/lib/oauth/oauth-core";
import { SITE_URL } from "@/lib/site-url";

// How agents get credentials (OAuth 2.1 or an API key) - linked from the
// authorization server metadata's service_documentation and llms.txt.
export const dynamic = "force-static";

export function GET() {
  // No frontmatter: auth.md readers (WorkOS spec, scanners) expect the
  // document to open with its top-level heading.
  const body = authMarkdown(SITE_URL);
  return new Response(body, { headers: { "Content-Type": MARKDOWN_CONTENT_TYPE, "Access-Control-Allow-Origin": "*" } });
}
