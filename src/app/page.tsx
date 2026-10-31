import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight, Bot, CheckSquare, Code2, Cpu, FileText, BookOpen, Brain, GitBranch, Github, Globe, MessageSquare, Server, Users, type LucideIcon } from "lucide-react";
import { hasDirectDatabase } from "@/lib/db/pool";
import { isBillingConfigured } from "@/lib/billing/stripe";
import { createServiceClient } from "@/lib/supabase-server";
import { PricingSection, type PlanRow } from "./pricing-section";
import { GITHUB_REPO_URL, SELF_HOSTING_DOCS_URL } from "@/lib/project-links";
import { homepageJsonLd, type FaqItem } from "@/lib/structured-data";
import { SITE_URL } from "@/lib/site-url";
import { BetaBadge } from "@/components/layout/beta-badge";
import { AnimatedFaq } from "@/components/landing/animated-faq";
import { RevealGroup } from "@/components/landing/reveal-group";
import { ProductScreen } from "@/components/landing/product-screen";
import type { PublicPlanPrice } from "@/lib/billing/public-pricing";
import styles from "@/components/landing/landing.module.css";
import { CtaLink } from "@/components/landing/cta-link";

interface FeatureSection {
  icon: LucideIcon;
  key: "taskBoard" | "aiTaskApi" | "decisions" | "knowledgeBase" | "memoryContext" | "roadmap";
}

// Mirrors the in-app nav (src/components/layout/app-sidebar.tsx) so a visitor
// who signs up finds the same icons and names they just read here. Copy
// (title/description/bullets) lives in messages/*.json under
// landing.features.<key>, resolved via getTranslations below. People first:
// what a team uses every day, then what an AI app adds.
const FEATURE_SECTIONS: FeatureSection[] = [
  { icon: CheckSquare, key: "taskBoard" },
  { icon: FileText, key: "decisions" },
  { icon: BookOpen, key: "knowledgeBase" },
  { icon: Brain, key: "memoryContext" },
  { icon: GitBranch, key: "roadmap" },
  { icon: Cpu, key: "aiTaskApi" },
];

// Plan together -> the why next to the task -> AI when you want it (landing.howItWorks.steps).
const HOW_IT_WORKS_ICONS: LucideIcon[] = [Users, FileText, Bot];

// landing.aiOptions.more, in order: API/webhooks, GitHub, browser agents, built-in chat.
const AI_OPTION_ICONS: LucideIcon[] = [Code2, Github, Globe, MessageSquare];

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

export default async function Home() {
  const t = await getTranslations("landing");
  const d = await getTranslations("landing.design");
  // Plain text on purpose: the same answers go into the FAQPage JSON-LD.
  const faq = t.raw("faq.items") as FaqItem[];
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

  const prices = hasDirectDatabase() ? [] : ((await createServiceClient()
    .from("plan_prices").select("plan_id, billing_interval, amount_cents").eq("active", true)).data as PublicPlanPrice[] | null) ?? [];

  const links = [
    {href:"#product", label:d("navProduct")},
    {href:"#features", label:d("navFeatures")},
    {href:"#integrations", label:d("navIntegrations")},
    {href:plans.length ? "#pricing" : "#self-hosted", label:plans.length ? d("navPricing") : t("footer.selfHosting")},
  ];
  const footerGroups = [
    {title:d("footerProduct"), links:[...links.slice(0,3), {href:"/start",label:t("getStarted")} ]},
    {title:d("footerResources"), links:[{href:"/developers",label:t("footer.developers")},{href:SELF_HOSTING_DOCS_URL,label:t("footer.selfHosting")},{href:GITHUB_REPO_URL,label:"GitHub"},{href:"/contact",label:t("footer.contact")},{href:"/brand",label:t("footer.brand")}]},
    {title:d("footerLegal"),links:[{href:"/legal/terms",label:t("footer.terms")},{href:"/legal/privacy",label:t("footer.privacy")},{href:"/legal/refunds",label:t("footer.refunds")},{href:"/legal/eula",label:t("footer.eula")},{href:"/legal/cookies",label:t("footer.cookies")}]},
  ];

  return (
    <div data-landing className={styles.landing}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(homepageJsonLd(SITE_URL, plans, FEATURE_SECTIONS.map(({ key }) => ({ title: t(`features.${key}.title`), description: t(`features.${key}.description`) })), faq)).replace(/</g, "\\u003c") }} />
      <a href="#landing-main" className={styles.skip}>{d("skip")}</a>
      <header className={styles.header}>
        <nav className={styles.navigation} aria-label={d("navLabel")}>
          <Link href="/" aria-label="Guidon" className={styles.logo}>
            <Image src="/brand/guidon-wordmark-blue.png" alt="Guidon" width={200} height={74} className="dark:hidden" />
            <Image src="/brand/guidon-wordmark-white.png" alt="Guidon" width={200} height={74} className="hidden dark:block" />
          </Link>
          <div className={styles.navLinks}>{links.map(link=><a key={link.href} href={link.href}>{link.label}</a>)}</div>
          <div className={styles.navActions}><Link className={styles.signIn} href="/auth/login">{t("signIn")}</Link><Link href="/start" className={styles.buttonSmall}>{d("navStart")}</Link></div>
        </nav>
      </header>

      <main id="landing-main" tabIndex={-1}>
        <section data-home-hero className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.container}>
            <p className={styles.eyebrow}><span className={styles.brandDot} aria-hidden />{d("eyebrow")}<BetaBadge /></p>
            <h1 id="hero-title">{d("heroFirst")}<br/><span>{d("heroSecond")}</span></h1>
            <p className={styles.lead}>{d("heroDescription")}</p>
            <div className={styles.actions}>
              <CtaLink cta="hero-start" href="/start" className={styles.button}>{t("getStarted")}<ArrowRight size={16} aria-hidden /></CtaLink>
              <a href="#product" className={styles.buttonSecondary}>{d("explore")}</a>
            </div>
            <p className={styles.heroNote}>{d("heroNote")}</p>
          </div>
        </section>

        <section id="product" className={styles.productSection} aria-labelledby="hero-shot-title">
          <div className={styles.productContainer}>
            <h2 id="hero-shot-title" className="sr-only">{t("heroShotTitle")}</h2>
            <div className={styles.productFrame}>
              <ProductScreen label={t("exploreProduct")} views={[
                {key:"hero-dashboard",title:t("previewDashboard"),alt:t("heroShotAlt")},
                {key:"taskBoard",title:d("taskDetails"),alt:d("taskDetails")},
                {key:"roadmap",title:t("features.roadmap.title"),alt:t("features.roadmap.title")},
              ]}/>
            </div>
            <p className={styles.caption}>{d("previewNote")}</p>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="benefits-title">
          <div className={styles.container}>
            <div className={styles.sectionHeading}>
              <p className={styles.kicker}>{d("benefitsLabel")}</p>
              <h2 id="benefits-title">{d("benefitsTitle")}</h2>
              <p>{d("benefitsDescription")}</p>
            </div>
            <RevealGroup className={styles.benefits}>
              {(t.raw("howItWorks.steps") as {title:string;description:string}[]).map((step,index)=>{
                const Icon=HOW_IT_WORKS_ICONS[index];
                return <div key={step.title}><Icon size={22} aria-hidden/><h3>{step.title}</h3><p>{step.description}</p></div>;
              })}
            </RevealGroup>
          </div>
        </section>

        <section id="features" className={`${styles.section} ${styles.sectionAlt}`} aria-labelledby="features-title">
          <div className={styles.container}>
            <div className={styles.sectionHeading}>
              <p className={styles.kicker}>{d("featuresLabel")}</p>
              <h2 id="features-title">{d("featuresTitle")}</h2>
              <p>{d("featuresDescription")}</p>
            </div>
            <div className={styles.featurePrimary}>
              <div className={styles.featureCopy}>
                <CheckSquare size={24} aria-hidden/>
                <h3>{t("features.taskBoard.title")}</h3>
                <p>{t("features.taskBoard.description")}</p>
                <ul>{(t.raw("features.taskBoard.bullets") as string[]).map(item=><li key={item}><span aria-hidden>✓</span>{item}</li>)}</ul>
              </div>
              <div className={styles.featureImage}>{["light","dark"].map(theme=><Image key={theme} src={`/landing/taskBoard-${theme}.webp`} alt={t("features.taskBoard.title")} width={1600} height={1000} sizes="(min-width: 960px) 650px, 100vw" className={theme==="light"?"dark:hidden":"hidden dark:block"}/>)}</div>
            </div>
            <RevealGroup className={styles.featureGrid}>
              {(["decisions","knowledgeBase"] as const).map(key=><article key={key} className={styles.featureCard}>
                <div className={styles.featureCopy}><h3>{t(`features.${key}.title`)}</h3><p>{t(`features.${key}.description`)}</p></div>
                <div className={styles.featureImage}>{["light","dark"].map(theme=><Image key={theme} src={`/landing/${key}-${theme}.webp`} alt={t(`features.${key}.title`)} width={1600} height={1000} sizes="(min-width: 768px) 540px, 100vw" className={theme==="light"?"dark:hidden":"hidden dark:block"}/>)}</div>
              </article>)}
            </RevealGroup>
            <div className={styles.capabilities}>
              {FEATURE_SECTIONS.filter(feature=>["memoryContext","roadmap","aiTaskApi"].includes(feature.key)).map(({key,icon:Icon})=><div key={key}><Icon size={18} aria-hidden/><div><h3>{t(`features.${key}.title`)}</h3><p>{t(`features.${key}.description`)}</p></div></div>)}
            </div>
          </div>
        </section>

        <section id="integrations" className={styles.section} aria-labelledby="integrations-title">
          <div className={`${styles.container} ${styles.integrationLayout}`}>
            <div className={styles.sectionHeading}>
              <p className={styles.kicker}>{d("integrationsLabel")}</p>
              <h2 id="integrations-title">{d("integrationsTitle")}</h2>
              <p>{t("aiOptions.subtitle")}</p>
              <Link href="/developers" className={styles.textLink}>{d("integrationDocs")}<ArrowRight size={16} aria-hidden/></Link>
            </div>
            <div className={styles.integrationPanel}>
              <div className={styles.apps}><p className={styles.kicker}>{t("aiOptions.appsTitle")}</p><ul>{(t.raw("aiOptions.apps") as string[]).map(app=><li key={app}>{app}</li>)}</ul></div>
              {(t.raw("aiOptions.more") as {title:string;description:string}[]).map((option,index)=>{
                const Icon=AI_OPTION_ICONS[index]??Bot;
                return <div key={option.title} className={styles.integrationRow}><Icon size={20} aria-hidden/><div><h3>{option.title}</h3><p>{option.description}</p></div></div>;
              })}
            </div>
          </div>
        </section>

        {plans.length > 0 && <PricingSection plans={plans} prices={prices} checkoutAvailable={!hasDirectDatabase() && isBillingConfigured()} />}

        <section id="self-hosted" className={`${styles.section} ${styles.hosting}`} aria-labelledby="self-host-title">
          <div className={styles.container}><Server size={24} aria-hidden/><div><h2 id="self-host-title">{t("selfHost.title")}</h2><p>{t("selfHost.description")}</p></div><a href={SELF_HOSTING_DOCS_URL} className={styles.buttonSecondary}>{t("selfHost.guide")}<ArrowRight size={16} aria-hidden/></a></div>
        </section>

        <section id="frequently-asked-questions" className={styles.section} aria-labelledby="faq-title">
          <div className={`${styles.container} ${styles.faqLayout}`}>
            <div className={styles.sectionHeading}><p className={styles.kicker}>{d("faqLabel")}</p><h2 id="faq-title">{t("faq.title")}</h2><Link href="/contact" className={styles.textLink}>{t("footer.contact")}<ArrowRight size={16} aria-hidden/></Link></div>
            <div className={styles.faq}>{faq.map(item=><AnimatedFaq key={item.q} question={item.q} answer={item.a}/>)}</div>
          </div>
        </section>

        <section className={`${styles.section} ${styles.finalCta}`} aria-labelledby="final-title">
          <div className={styles.container}><p className={styles.kicker}>{d("finalLabel")}</p><h2 id="final-title">{d("finalTitle")}</h2><p>{d("finalDescription")}</p><div className={styles.actions}><CtaLink cta="how-start" href="/start" className={styles.button}>{t("getStarted")}<ArrowRight size={16} aria-hidden/></CtaLink><CtaLink cta="hero-sandbox" prefetch={false} href="/sandbox" className={styles.buttonSecondary}>{d("sandbox")}</CtaLink></div></div>
        </section>
      </main>

      <footer data-site-footer className={styles.footer}>
        <div className={`${styles.container} ${styles.footerGrid}`}>
          <div className={styles.footerBrand}><Link href="/" className={styles.logo} aria-label="Guidon"><Image src="/brand/guidon-wordmark-blue.png" alt="Guidon" width={200} height={74} className="dark:hidden"/><Image src="/brand/guidon-wordmark-white.png" alt="Guidon" width={200} height={74} className="hidden dark:block"/></Link><p>{d("footerDescription")}</p><BetaBadge/></div>
          {footerGroups.map(group=><div key={group.title}><h2>{group.title}</h2><ul>{group.links.map(link=><li key={link.href}><Link prefetch={false} href={link.href}>{link.label}</Link></li>)}</ul></div>)}
        </div>
        <div className={`${styles.container} ${styles.footerBottom}`}><span>{t("footer.copyright",{year:new Date().getFullYear()})} · Two Steps Studio</span><Link href="/about">{t("footer.about")}</Link></div>
      </footer>
    </div>
  );
}
