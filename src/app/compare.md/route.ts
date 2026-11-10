import { MARKDOWN_CONTENT_TYPE, withFrontmatter } from "@/lib/agent-web";
import { CHECKED, compareIndexMarkdown } from "@/lib/compare";
import { SITE_URL } from "@/lib/site-url";

// Markdown twin of /compare (src/proxy.ts serves it there to agents).
export const dynamic = "force-static";

export function GET() {
  const body = withFrontmatter(compareIndexMarkdown(), {
    title: "Compare Guidon with Jira, Linear, Plane, Notion and more",
    canonical: `${SITE_URL}/compare`,
    lastUpdated: CHECKED,
  });
  return new Response(body, { headers: { "Content-Type": MARKDOWN_CONTENT_TYPE, Vary: "Accept" } });
}
