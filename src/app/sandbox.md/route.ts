import { MARKDOWN_CONTENT_TYPE, withFrontmatter } from "@/lib/agent-web";
import { sandboxMarkdown } from "@/lib/company-pages";
import { SITE_URL } from "@/lib/site-url";

// Markdown twin of /sandbox (src/proxy.ts serves it there to agents).
export const dynamic = "force-static";

export function GET() {
  const body = withFrontmatter(sandboxMarkdown(SITE_URL), {
    title: "Guidon sandbox",
    description: "A free test environment for the Guidon API, MCP server and AI agents: example tasks you can change and reset.",
    canonical: `${SITE_URL}/sandbox`,
  });
  return new Response(body, { headers: { "Content-Type": MARKDOWN_CONTENT_TYPE, Vary: "Accept" } });
}
