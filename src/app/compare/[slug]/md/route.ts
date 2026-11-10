import { MARKDOWN_CONTENT_TYPE, withFrontmatter } from "@/lib/agent-web";
import { CHECKED, COMPARISONS, comparison, comparisonMarkdown } from "@/lib/compare";
import { SITE_URL } from "@/lib/site-url";

// Markdown twin of /compare/<slug>, served at /compare/<slug>.md and to
// agents on the page URL (both rewritten here by src/proxy.ts).
export const dynamicParams = false;

export function generateStaticParams() {
  return COMPARISONS.map((c) => ({ slug: c.slug }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const c = comparison((await params).slug);
  if (!c) return new Response("Not found", { status: 404 });
  const body = withFrontmatter(comparisonMarkdown(c), {
    title: `Guidon vs ${c.name}: ${c.angle}`,
    description: c.summary,
    canonical: `${SITE_URL}/compare/${c.slug}`,
    lastUpdated: CHECKED,
  });
  return new Response(body, { headers: { "Content-Type": MARKDOWN_CONTENT_TYPE, Vary: "Accept" } });
}
