import { companyPageJsonLd, homepageJsonLd } from "@/lib/structured-data";
import { docPages } from "@/lib/docs-index";
import { SITE_URL } from "@/lib/site-url";

/**
 * The site's schema.org data as JSON Lines (NLWeb Schema Feeds): the
 * homepage graph's nodes, the about/contact pages, and one TechArticle per
 * public documentation page. Prices aren't here - they come from the
 * database and live on the homepage's own JSON-LD.
 */
export const dynamic = "force-static";

export function GET() {
  const context = "https://schema.org";
  const home = homepageJsonLd(SITE_URL, []);
  const nodes: Record<string, unknown>[] = [
    ...home["@graph"],
    companyPageJsonLd(SITE_URL, "AboutPage", "/about", "About Guidon")["@graph"][1],
    companyPageJsonLd(SITE_URL, "ContactPage", "/contact", "Contact Guidon")["@graph"][1],
    ...docPages(SITE_URL)
      .filter((page) => !["about", "contact"].includes(page.id))
      .map((page) => ({
        "@type": "TechArticle",
        "@id": page.url,
        url: page.url,
        headline: page.title,
        inLanguage: "en",
        publisher: { "@id": `${SITE_URL}/#organization` },
        isPartOf: { "@id": `${SITE_URL}/#website` },
      })),
  ];
  const body = nodes.map((node) => JSON.stringify({ "@context": context, ...node })).join("\n") + "\n";
  return new Response(body, { headers: { "Content-Type": "application/x-jsonlines; charset=utf-8" } });
}
