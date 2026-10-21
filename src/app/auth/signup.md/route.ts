import { MARKDOWN_CONTENT_TYPE, withFrontmatter } from "@/lib/agent-web";
import { signUpMarkdown } from "@/lib/company-pages";
import { SITE_URL } from "@/lib/site-url";

// Markdown twin of /auth/signup (src/proxy.ts serves it there to agents).
export const dynamic = "force-static";

export function GET() {
  const body = withFrontmatter(signUpMarkdown(SITE_URL), { title: "Create a Guidon account", canonical: `${SITE_URL}/auth/signup` });
  return new Response(body, { headers: { "Content-Type": MARKDOWN_CONTENT_TYPE, Vary: "Accept" } });
}
