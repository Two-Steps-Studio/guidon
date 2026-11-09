import type { Metadata } from "next";
import { MarkdownPage } from "@/components/layout/markdown-page";
import { compareIndexMarkdown } from "@/lib/compare";
import { publicOpenGraph } from "@/lib/public-open-graph";

export const metadata: Metadata = {
  title: { absolute: "Compare Guidon with Jira, Linear, Plane, Notion and more" },
  description: "How Guidon compares with the project tools teams use most - who should choose which, including where the other tool is better.",
  alternates: { canonical: "/compare" },
  openGraph: publicOpenGraph("/compare"),
};

export default function CompareIndexPage() {
  return <MarkdownPage markdown={compareIndexMarkdown()} />;
}
