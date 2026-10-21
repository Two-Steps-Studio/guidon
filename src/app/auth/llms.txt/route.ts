import { authLlmsTxt } from "@/lib/oauth/oauth-core";
import { SITE_URL } from "@/lib/site-url";

// Section-level llms.txt for authentication, linked from /llms.txt.
export const dynamic = "force-static";

export function GET() {
  return new Response(authLlmsTxt(SITE_URL), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
