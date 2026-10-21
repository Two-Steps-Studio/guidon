import type { Metadata } from "next";
import { MarkdownPage } from "@/components/layout/markdown-page";
import { developersMarkdown } from "@/lib/developers-doc";
import { SITE_URL } from "@/lib/site-url";

export const metadata: Metadata = {
  title: { absolute: "Guidon API and MCP server - developer docs" },
  description: "Connect AI agents and scripts to Guidon: API keys and scopes, the MCP server, REST endpoints, OpenAPI and errors.",
  alternates: { canonical: "/developers", types: { "text/markdown": "/developers.md" } },
};

/** Public developer guide - same Markdown as /developers.md (src/lib/developers-doc.ts). */
export default function DevelopersPage() {
  return <MarkdownPage markdown={developersMarkdown(SITE_URL)} />;
}
