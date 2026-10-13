import en from "../../../messages/en.json";
import { homepageMarkdown, MARKDOWN_CONTENT_TYPE } from "@/lib/agent-web";
import { SITE_URL } from "@/lib/site-url";

// The homepage as Markdown. src/proxy.ts rewrites `/` here for requests with
// `Accept: text/markdown` (https://acceptmarkdown.com); it is also reachable
// directly. Built from the same copy as src/app/page.tsx, so it can be
// generated once at build time.
export const dynamic = "force-static";

export function GET() {
  return new Response(homepageMarkdown(en.landing, SITE_URL), {
    headers: {
      "Content-Type": MARKDOWN_CONTENT_TYPE,
      Vary: "Accept",
    },
  });
}
