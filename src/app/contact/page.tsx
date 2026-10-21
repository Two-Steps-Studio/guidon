import type { Metadata } from "next";
import { MarkdownPage } from "@/components/layout/markdown-page";
import { contactMarkdown } from "@/lib/company-pages";
import { SITE_URL } from "@/lib/site-url";
import { companyPageJsonLd } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: "Contact Guidon",
  description: "How to reach the Guidon team: support, privacy requests, bug reports and security issues.",
  alternates: { canonical: "/contact", types: { "text/markdown": "/contact.md" } },
};

/** Same Markdown as /contact.md (src/lib/company-pages.ts). */
export default function ContactPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(companyPageJsonLd(SITE_URL, "ContactPage", "/contact", "Contact Guidon")).replace(/</g, "\\u003c"),
        }}
      />
      <MarkdownPage markdown={contactMarkdown(SITE_URL)} />
    </>
  );
}
