import type { Metadata } from "next";
import { MarkdownPage } from "@/components/layout/markdown-page";
import { aboutMarkdown } from "@/lib/company-pages";
import { SITE_URL } from "@/lib/site-url";
import { companyPageJsonLd } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: "About Guidon",
  description: "Who makes Guidon - context-first project management for development teams - and what makes it different.",
  alternates: { canonical: "/about", types: { "text/markdown": "/about.md" } },
};

/** Same Markdown as /about.md (src/lib/company-pages.ts). */
export default function AboutPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(companyPageJsonLd(SITE_URL, "AboutPage", "/about", "About Guidon")).replace(/</g, "\\u003c"),
        }}
      />
      <MarkdownPage markdown={aboutMarkdown(SITE_URL)} />
    </>
  );
}
