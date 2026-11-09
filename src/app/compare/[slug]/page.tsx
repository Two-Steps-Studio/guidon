import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarkdownPage } from "@/components/layout/markdown-page";
import { COMPARISONS, comparison, comparisonMarkdown } from "@/lib/compare";
import { publicOpenGraph } from "@/lib/public-open-graph";

export const dynamicParams = false;

export function generateStaticParams() {
  return COMPARISONS.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const c = comparison((await params).slug);
  if (!c) return {};
  return {
    title: { absolute: `Guidon vs ${c.name}: ${c.angle}` },
    description: c.summary,
    alternates: { canonical: `/compare/${c.slug}` },
    openGraph: publicOpenGraph(`/compare/${c.slug}`),
  };
}

export default async function ComparisonPage({ params }: { params: Promise<{ slug: string }> }) {
  const c = comparison((await params).slug);
  if (!c) notFound();
  return <MarkdownPage markdown={comparisonMarkdown(c)} />;
}
