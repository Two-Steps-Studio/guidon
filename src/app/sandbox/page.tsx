import type { Metadata } from "next";
import { MarkdownPage } from "@/components/layout/markdown-page";
import { sandboxMarkdown } from "@/lib/company-pages";
import { SITE_URL } from "@/lib/site-url";
import { companyPageJsonLd } from "@/lib/structured-data";

const DESCRIPTION = "A free test environment for the Guidon API, MCP server and AI agents: example tasks you can change and reset.";

export const metadata: Metadata = {
  title: "Sandbox - try the Guidon API and agents",
  description: DESCRIPTION,
  alternates: { canonical: "/sandbox", types: { "text/markdown": "/sandbox.md" } },
};

/** Same Markdown as /sandbox.md (src/lib/company-pages.ts); /sandbox/start opens the signed-in user's own. */
export default function SandboxPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(companyPageJsonLd(SITE_URL, "WebPage", "/sandbox", "Sandbox")).replace(/</g, "\\u003c"),
        }}
      />
      <MarkdownPage markdown={sandboxMarkdown(SITE_URL)} />
    </>
  );
}
