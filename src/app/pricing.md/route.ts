import { MARKDOWN_CONTENT_TYPE, pricingMarkdown, withFrontmatter, type PricingPlan } from "@/lib/agent-web";
import { hasDirectDatabase } from "@/lib/db/pool";
import { createServiceClient } from "@/lib/supabase-server";
import { SITE_URL } from "@/lib/site-url";

// Same freshness as the landing page's pricing section (src/app/page.tsx).
export const revalidate = 3600;

/**
 * Guidon Cloud's plans as Markdown, for agents comparing products. Read with
 * the service client for the same reason as the landing page: `plans` has no
 * anon grant, and this is public price copy, nothing user-scoped. Self-hosted
 * installs have no billing, so they list no plans.
 */
export async function GET() {
  const plans = hasDirectDatabase()
    ? []
    : (((await createServiceClient().from("plans").select("*").order("sort_order")).data as PricingPlan[] | null) ?? []);
  const body = withFrontmatter(pricingMarkdown(plans, SITE_URL), {
    title: "Guidon pricing",
    description: "Guidon Cloud plans: prices, limits and features.",
    canonical: `${SITE_URL}/#pricing`,
  });
  return new Response(body, { headers: { "Content-Type": MARKDOWN_CONTENT_TYPE } });
}
