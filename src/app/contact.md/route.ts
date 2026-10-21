import { MARKDOWN_CONTENT_TYPE, withFrontmatter } from "@/lib/agent-web";
import { contactMarkdown } from "@/lib/company-pages";
import { SITE_URL } from "@/lib/site-url";

// Markdown twin of /contact (src/proxy.ts serves it there to agents).
export const dynamic = "force-static";

export function GET() {
  const body = withFrontmatter(contactMarkdown(SITE_URL), {
    title: "Contact Guidon",
    description: "How to reach the Guidon team: support, privacy requests, bug reports and security issues.",
    canonical: `${SITE_URL}/contact`,
  });
  return new Response(body, { headers: { "Content-Type": MARKDOWN_CONTENT_TYPE, Vary: "Accept" } });
}
