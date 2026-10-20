import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Fraunces } from "next/font/google";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { CheckSquare, Cpu, FileText, BookOpen, Brain, GitBranch, Github, Server, type LucideIcon } from "lucide-react";
import { hasDirectDatabase } from "@/lib/db/pool";
import { createServiceClient } from "@/lib/supabase-server";
import { PricingSection, type PlanRow } from "./pricing-section";
import { SiteFooter } from "@/components/layout/site-footer";
import { GITHUB_REPO_URL, SELF_HOSTING_DOCS_URL } from "@/lib/project-links";

// A display serif for headlines only, paired against the app-wide Geist Sans
// body font - scoped to this marketing page so the rest of the app (which
// has no room for a decorative font) is untouched.
const displayFont = Fraunces({ subsets: ["latin"], weight: ["600"] });

interface FeatureSection {
  icon: LucideIcon;
  key: "taskBoard" | "aiTaskApi" | "decisions" | "knowledgeBase" | "memoryContext" | "roadmap";
}

// Mirrors the in-app nav (src/components/layout/app-sidebar.tsx) so a visitor
// who signs up finds the same icons and names they just read here. Copy
// (title/description/bullets) lives in messages/*.json under
// landing.features.<key>, resolved via getTranslations below.
const FEATURE_SECTIONS: FeatureSection[] = [
  { icon: CheckSquare, key: "taskBoard" },
  { icon: Cpu, key: "aiTaskApi" },
  { icon: FileText, key: "decisions" },
  { icon: BookOpen, key: "knowledgeBase" },
  { icon: Brain, key: "memoryContext" },
  { icon: GitBranch, key: "roadmap" },
];

// This page has no cookies()/headers() calls, so Next statically prerenders
// it - without this, the pricing section's plan data would be baked in at
// build time and never reflect a price changed later via the admin plan
// editor (src/app/admin/organizations/plan-editor.tsx) until the next
// deploy. Revalidating hourly is enough freshness for prices that change
// rarely, without making the whole marketing page dynamic-per-request.
export const revalidate = 3600;

// The Markdown twin agents get at the same URL (src/proxy.ts) is also
// advertised in the head, for clients that look for it there.
export const metadata: Metadata = {
  alternates: { canonical: "/", types: { "text/markdown": "/index.md" } },
};

// Structured data so search engines can understand what Guidon is beyond the
// visible copy - a SoftwareApplication listing is the schema Google expects
// for a SaaS product page and is what backs eligibility for rich results.
const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Guidon",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "Context-first project management for development teams. Track tasks, decisions, sources, and project memory together.",
  url: "https://useguidon.com",
  sameAs: [GITHUB_REPO_URL],
  offers: {
    "@type": "Offer",
    category: "Freemium",
  },
};

export default async function Home() {
  const t = await getTranslations("landing");
  // Self-hosted installs have no billing concept at all (mirrors
  // organizations/[id]/billing/page.tsx) - Guidon Cloud pricing has no
  // meaning on someone's own deployment, so the section is skipped rather
  // than showing SaaS prices that don't apply.
  //
  // plans has no `anon` grant (015_subscriptions.sql restricts it to
  // `authenticated`) since it's normally read from inside the authenticated
  // app, not a public marketing page - createServiceClient() is the
  // service-role bypass, safe here because this is read-only public pricing
  // copy, not anything user-scoped.
  const plans = hasDirectDatabase()
    ? []
    : ((await createServiceClient().from("plans").select("*").order("sort_order")).data as PlanRow[] | null) ?? [];

  return (
    <>
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
    />
    <main>
    {/* Not full-screen: the live board mockup below starts above the fold,
        so the first screen shows the product, not only the pitch. */}
    <div className="relative overflow-hidden bg-background/70 dark:bg-background/60">
      <div className="container relative z-10 mx-auto px-4 pb-12 pt-14 md:pt-20">
        <div className="max-w-5xl mx-auto text-center space-y-8">
          <div className="space-y-6">
            <Image
              src="/assets/guidon-wordmark.png"
              alt="Guidon"
              width={769}
              height={285}
              priority
              className="mx-auto h-16 w-auto dark:invert md:h-20"
            />
            <div className="space-y-3">
              <h1
                className={`${displayFont.className} text-5xl md:text-6xl tracking-tight text-text dark:text-text`}
              >
                {t("heroTitle")}
              </h1>
              <p className="text-xl text-text-secondary max-w-3xl mx-auto leading-relaxed">
                {t("heroSubtitle")}
              </p>
            </div>
          </div>

          <div>
            <div className="flex gap-4 justify-center flex-wrap">
              <Button size="lg" className="text-base px-8 py-6 h-auto" asChild>
                <Link href="/auth/signup">{t("getStarted")}</Link>
              </Button>
              <Button size="lg" variant="outline" className="text-base px-8 py-6 h-auto" asChild>
                <Link href="/auth/login">{t("signIn")}</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <section className="bg-gradient-to-b from-background/70 to-transparent px-4 pb-20 dark:from-background/60" aria-labelledby="hero-shot-title">
      <h2 id="hero-shot-title" className="sr-only">
        {t("heroShotTitle")}
      </h2>
      {/* A laptop drawn in CSS around a real screenshot of the dashboard, one
          per theme - regenerate with scripts/landing/capture.mjs. */}
      <div className="mx-auto max-w-6xl">
        <div className="relative mx-auto w-[88%] rounded-t-[1.1rem] rounded-b-sm border border-neutral-700 bg-neutral-900 p-[1.4%] pb-[1.8%] shadow-2xl dark:border-neutral-600">
          <span className="absolute left-1/2 top-[0.55%] h-1 w-1 -translate-x-1/2 rounded-full bg-neutral-600 md:h-1.5 md:w-1.5" aria-hidden />
          <div className="overflow-hidden rounded-[0.3rem] bg-background">
            <Image
              src="/landing/hero-dashboard-light.webp"
              alt={t("heroShotAlt")}
              width={2000}
              height={1250}
              priority
              sizes="(min-width: 1152px) 1000px, 88vw"
              className="h-auto w-full dark:hidden"
            />
            <Image
              src="/landing/hero-dashboard-dark.webp"
              alt={t("heroShotAlt")}
              width={2000}
              height={1250}
              sizes="(min-width: 1152px) 1000px, 88vw"
              className="hidden h-auto w-full dark:block"
            />
          </div>
        </div>
        <div className="relative mx-auto h-3 w-full rounded-b-2xl bg-gradient-to-b from-neutral-300 to-neutral-400 shadow-xl md:h-5 dark:from-neutral-600 dark:to-neutral-800" aria-hidden>
          <div className="absolute left-1/2 top-0 h-1.5 w-[14%] -translate-x-1/2 rounded-b-lg bg-neutral-400 md:h-2 dark:bg-neutral-900/70" />
        </div>
      </div>
    </section>

    <section className="border-t border-border py-20">
      <div className="container mx-auto max-w-6xl px-4">
        <div className="scrim mx-auto mb-16 max-w-3xl space-y-3 rounded-2xl px-6 py-6 text-center">
          <h2 className={`${displayFont.className} text-3xl md:text-4xl`}>
            {t("featuresTitle")}
          </h2>
          <p className="text-text-secondary max-w-2xl mx-auto">
            {t("featuresSubtitle")}
          </p>
        </div>

        <div className="space-y-16">
          {FEATURE_SECTIONS.map((feature, index) => {
            const Icon = feature.icon;
            const reversed = index % 2 === 1;
            // t.raw() instead of t(): each `bullets` value is a JSON array
            // of strings, not an ICU message, so t()'s string-interpolation
            // formatting doesn't apply - .raw() returns the array as-is.
            const bullets = t.raw(`features.${feature.key}.bullets`) as string[];
            return (
              <div
                key={feature.key}
                className={`flex flex-col md:flex-row items-center gap-8 md:gap-12 ${
                  reversed ? "md:flex-row-reverse" : ""
                }`}
              >
                {/* Real screenshots of the demo project, one per theme -
                    regenerate with scripts/landing/capture.mjs when the
                    captured pages change. */}
                <div className="w-full md:w-[55%] md:shrink-0">
                  <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xl">
                    <Image
                      src={`/landing/${feature.key}-light.webp`}
                      alt={t(`features.${feature.key}.title`)}
                      width={1600}
                      height={1000}
                      sizes="(min-width: 768px) 55vw, 100vw"
                      className="h-auto w-full dark:hidden"
                    />
                    <Image
                      src={`/landing/${feature.key}-dark.webp`}
                      alt={t(`features.${feature.key}.title`)}
                      width={1600}
                      height={1000}
                      sizes="(min-width: 768px) 55vw, 100vw"
                      className="hidden h-auto w-full dark:block"
                    />
                  </div>
                </div>
                <div className="scrim flex-1 space-y-3 rounded-2xl p-6 text-center md:text-left">
                  <div className="mx-auto md:mx-0 w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="text-2xl font-semibold">{t(`features.${feature.key}.title`)}</h3>
                  <p className="text-text-secondary leading-relaxed">{t(`features.${feature.key}.description`)}</p>
                  <ul className="inline-block text-left text-sm text-text-secondary space-y-1.5 pt-1">
                    {bullets.map((bullet) => (
                      <li key={bullet} className="flex items-start gap-2">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
                        {bullet}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>

    {plans.length > 0 && <PricingSection plans={plans} />}

    <section className="border-t border-border py-20" aria-labelledby="self-host-title">
      <div className="container mx-auto max-w-3xl px-4">
        <div className="scrim space-y-4 rounded-2xl px-6 py-8 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
            <Server className="h-5 w-5 text-primary" />
          </div>
          <h2 id="self-host-title" className={`${displayFont.className} text-3xl md:text-4xl`}>
            {t("selfHost.title")}
          </h2>
          <p className="mx-auto max-w-2xl text-text-secondary">{t("selfHost.description")}</p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Button asChild>
              <a href={SELF_HOSTING_DOCS_URL} target="_blank" rel="noopener noreferrer">
                <Server className="mr-2 h-4 w-4" />
                {t("selfHost.guide")}
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">
                <Github className="mr-2 h-4 w-4" />
                {t("selfHost.github")}
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
    </main>
    <SiteFooter />
    </>
  );
}
