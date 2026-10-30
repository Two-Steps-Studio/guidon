// No imports: loaded by tests/agent-web.test.mjs with Node's type stripping.

// Same values as lib/project-links.ts (test:agent-web checks they match).
const GITHUB_REPO_URL = "https://github.com/two-steps-studio/guidon";
const GITHUB_ORG_URL = "https://github.com/Two-Steps-Studio";
const SUPPORT_EMAIL = "guidon.support@gmail.com";

/**
 * schema.org JSON-LD for the public pages. Only what the page itself shows
 * or what is plainly true (no invented address lines or ratings): the
 * address is the country, because Two Steps Studio has no registered
 * address yet (see the Terms, section 1).
 */

export const DESCRIPTION =
  "A project board for teams: plan, assign and finish tasks together, with the decisions and history behind each one kept next to it. Optional AI: connect Claude, ChatGPT, Cursor, Codex or any MCP app, plus a REST API, webhooks and GitHub, and it works from the same tasks under your review.";

/** Profiles that are the same entity, for disambiguation - add LinkedIn/X/Wikidata here once they exist. */
export const SAME_AS: readonly string[] = [GITHUB_REPO_URL];

export function organizationNode(siteUrl: string) {
  return {
    "@type": "Organization",
    "@id": `${siteUrl}/#organization`,
    name: "Two Steps Studio",
    alternateName: "Guidon",
    url: siteUrl,
    logo: `${siteUrl}/icon.png`,
    email: SUPPORT_EMAIL,
    brand: { "@type": "Brand", name: "Guidon", url: siteUrl },
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: SUPPORT_EMAIL,
        url: `${siteUrl}/contact`,
        availableLanguage: ["en", "pl", "de", "es"],
      },
    ],
    address: { "@type": "PostalAddress", addressCountry: "PL" },
    sameAs: [GITHUB_ORG_URL],
  };
}

export interface PricedPlan {
  name: string;
  price_cents: number | null;
}

export interface FeatureItem {
  title: string;
  description: string;
}

/**
 * Homepage: who (Organization), the site (WebSite), the product with the
 * prices the pricing section shows and the feature sections it lists
 * (ItemList + featureList), and the API.
 */
export interface FaqItem {
  q: string;
  a: string;
}

export function homepageJsonLd(siteUrl: string, plans: PricedPlan[], features: FeatureItem[] = [], faq: FaqItem[] = []) {
  const offers = plans
    .filter((plan) => plan.price_cents !== null)
    .map((plan) => ({
      "@type": "Offer",
      name: plan.name,
      price: ((plan.price_cents ?? 0) / 100).toFixed(2),
      priceCurrency: "EUR",
      url: `${siteUrl}/#pricing`,
      ...(plan.price_cents ? { priceSpecification: { "@type": "UnitPriceSpecification", price: ((plan.price_cents ?? 0) / 100).toFixed(2), priceCurrency: "EUR", unitCode: "MON" } } : {}),
    }));
  return {
    "@context": "https://schema.org",
    "@graph": [
      organizationNode(siteUrl),
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        name: "Guidon",
        alternateName: new URL(siteUrl).hostname,
        url: siteUrl,
        description: DESCRIPTION,
        publisher: { "@id": `${siteUrl}/#organization` },
        inLanguage: ["en", "pl", "de", "es"],
      },
      {
        "@type": "WebPage",
        "@id": `${siteUrl}/#webpage`,
        url: siteUrl,
        name: "Guidon - One board for your team's work. Your AI can help too.",
        description: DESCRIPTION,
        isPartOf: { "@id": `${siteUrl}/#website` },
        about: { "@id": `${siteUrl}/#software` },
        mainEntity: { "@id": `${siteUrl}/#software` },
        inLanguage: ["en", "pl", "de", "es"],
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${siteUrl}/#software`,
        name: "Guidon",
        applicationCategory: "BusinessApplication",
        applicationSubCategory: "Project management",
        operatingSystem: "Web, Windows, macOS, Linux",
        description: DESCRIPTION,
        url: siteUrl,
        publisher: { "@id": `${siteUrl}/#organization` },
        isAccessibleForFree: true,
        codeRepository: GITHUB_REPO_URL,
        sameAs: [...SAME_AS],
        ...(features.length ? { featureList: features.map((feature) => feature.title) } : {}),
        ...(offers.length ? { offers } : { offers: { "@type": "Offer", price: "0", priceCurrency: "EUR", category: "Freemium" } }),
      },
      {
        "@type": "Product",
        "@id": `${siteUrl}/#product`,
        name: "Guidon Project Management",
        description: DESCRIPTION,
        category: "Project management software",
        url: siteUrl,
        brand: { "@id": `${siteUrl}/#organization` },
        mainEntityOfPage: { "@id": `${siteUrl}/#webpage` },
        isRelatedTo: { "@id": `${siteUrl}/#software` },
        ...(offers.length ? { offers } : { offers: { "@type": "Offer", price: "0", priceCurrency: "EUR", category: "Freemium" } }),
      },
      {
        "@type": "Service",
        "@id": `${siteUrl}/#service`,
        name: "Guidon Cloud project management",
        serviceType: "Project management software",
        description: DESCRIPTION,
        url: siteUrl,
        provider: { "@id": `${siteUrl}/#organization` },
        brand: { "@id": `${siteUrl}/#organization` },
        isRelatedTo: { "@id": `${siteUrl}/#software` },
        ...(offers.length ? { offers } : { offers: { "@type": "Offer", price: "0", priceCurrency: "EUR", category: "Freemium" } }),
      },
      ...(faq.length
        ? [
            {
              "@type": "FAQPage",
              "@id": `${siteUrl}/#frequently-asked-questions`,
              mainEntity: faq.map((item) => ({
                "@type": "Question",
                name: item.q,
                acceptedAnswer: { "@type": "Answer", text: item.a },
              })),
            },
          ]
        : []),
      ...(features.length
        ? [
            {
              "@type": "ItemList",
              "@id": `${siteUrl}/#features`,
              name: "Guidon features",
              itemListElement: features.map((feature, index) => ({
                "@type": "ListItem",
                position: index + 1,
                name: feature.title,
                description: feature.description,
              })),
            },
          ]
        : []),
      {
        "@type": "WebAPI",
        "@id": `${siteUrl}/#api`,
        name: "Guidon API",
        description: "REST API and MCP server for AI agents and scripts: tasks, comments, attempts, decisions, knowledge, roadmap and project memory.",
        documentation: `${siteUrl}/developers`,
        url: `${siteUrl}/api/v1`,
        provider: { "@id": `${siteUrl}/#organization` },
      },
    ],
  };
}

/** /about and /contact: the page type plus the Organization it is about. */
/** Home > page, for subpages' search results. */
export function breadcrumbNode(siteUrl: string, path: string, name: string) {
  return {
    "@type": "BreadcrumbList",
    "@id": `${siteUrl}${path}#breadcrumb`,
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Guidon", item: `${siteUrl}/` },
      { "@type": "ListItem", position: 2, name, item: `${siteUrl}${path}` },
    ],
  };
}

export function companyPageJsonLd(siteUrl: string, kind: "AboutPage" | "ContactPage" | "WebPage", path: string, name: string) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      organizationNode(siteUrl),
      {
        "@type": kind,
        "@id": `${siteUrl}${path}`,
        url: `${siteUrl}${path}`,
        name,
        isPartOf: { "@type": "WebSite", "@id": `${siteUrl}/#website` },
        about: { "@id": `${siteUrl}/#organization` },
        breadcrumb: { "@id": `${siteUrl}${path}#breadcrumb` },
      },
      breadcrumbNode(siteUrl, path, name),
    ],
  };
}
