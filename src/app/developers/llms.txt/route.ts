import { developersLlmsTxt } from "@/lib/developers-doc";
import { SITE_URL } from "@/lib/site-url";

// Section-level llms.txt for the developer docs, linked from /llms.txt.
export const dynamic = "force-static";

export function GET() {
  return new Response(developersLlmsTxt(SITE_URL), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
