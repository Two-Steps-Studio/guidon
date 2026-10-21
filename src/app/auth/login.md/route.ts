import { MARKDOWN_CONTENT_TYPE, withFrontmatter } from "@/lib/agent-web";
import { signInMarkdown } from "@/lib/company-pages";
import { SITE_URL } from "@/lib/site-url";

// Markdown twin of /auth/login (src/proxy.ts serves it there to agents).
export const dynamic = "force-static";

export function GET() {
  const body = withFrontmatter(signInMarkdown(SITE_URL), { title: "Sign in to Guidon", canonical: `${SITE_URL}/auth/login` });
  return new Response(body, { headers: { "Content-Type": MARKDOWN_CONTENT_TYPE, Vary: "Accept" } });
}
