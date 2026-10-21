import { MARKDOWN_CONTENT_TYPE, withFrontmatter } from "@/lib/agent-web";
import { aboutMarkdown } from "@/lib/company-pages";
import { SITE_URL } from "@/lib/site-url";

// Markdown twin of /about (src/proxy.ts serves it there to agents).
export const dynamic = "force-static";

export function GET() {
  const body = withFrontmatter(aboutMarkdown(SITE_URL), {
    title: "About Guidon",
    description: "Who makes Guidon - context-first project management for development teams - and what makes it different.",
    canonical: `${SITE_URL}/about`,
  });
  return new Response(body, { headers: { "Content-Type": MARKDOWN_CONTENT_TYPE, Vary: "Accept" } });
}
