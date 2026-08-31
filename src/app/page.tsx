import Image from "next/image";
import Link from "next/link";
import { Fraunces } from "next/font/google";
import { Button } from "@/components/ui/button";
import { CheckSquare, Cpu, FileText, BookOpen, Brain, GitBranch, type LucideIcon } from "lucide-react";
import { WavesBackground } from "@/components/layout/waves-background";
import { hasDirectDatabase } from "@/lib/db/pool";
import { createServiceClient } from "@/lib/supabase-server";
import { PricingSection, type PlanRow } from "./pricing-section";

// A display serif for headlines only, paired against the app-wide Geist Sans
// body font - scoped to this marketing page so the rest of the app (which
// has no room for a decorative font) is untouched.
const displayFont = Fraunces({ subsets: ["latin"], weight: ["600"] });

interface FeatureSection {
  icon: LucideIcon;
  title: string;
  description: string;
  bullets: string[];
}

// Mirrors the in-app nav (src/components/layout/app-sidebar.tsx) so a visitor
// who signs up finds the same icons and names they just read here.
const FEATURE_SECTIONS: FeatureSection[] = [
  {
    icon: CheckSquare,
    title: "Task Board",
    description:
      "A Kanban board for every project, with columns you control. Rename, reorder, or hide statuses to match how your team actually works.",
    bullets: [
      "Drag-and-drop board per project",
      "Per-project column customization",
      "Filter and search across tasks",
    ],
  },
  {
    icon: Cpu,
    title: "AI Task API",
    description:
      "Let AI agents pick up tasks and move them through the same board your team uses, from in-progress to done, without a human relaying updates by hand.",
    bullets: [
      "Agents claim and complete tasks via API",
      "Full audit trail of AI-driven changes",
      "Human review built into the workflow",
    ],
  },
  {
    icon: FileText,
    title: "Decisions",
    description:
      "A running log of the architectural and technical decisions your team makes, with the reasoning attached, so the \"why\" survives past the meeting it was made in.",
    bullets: [
      "Structured decision records",
      "Linked to the tasks and context they affect",
      "Searchable history of past tradeoffs",
    ],
  },
  {
    icon: BookOpen,
    title: "Knowledge Base",
    description:
      "Centralize the sources, docs, and technologies each project depends on, instead of scattering them across chats and wikis nobody checks.",
    bullets: [
      "Tracked sources and references",
      "Per-project technology inventory",
      "One place new teammates can start",
    ],
  },
  {
    icon: Brain,
    title: "Memory & Context Graph",
    description:
      "Guidon remembers project knowledge over time and connects decisions, sources, and tasks to each other, so context isn't lost as a project grows.",
    bullets: [
      "Persistent, searchable project memory",
      "AI-generated insights you verify before they count as fact",
      "A graph of relations between entities",
    ],
  },
  {
    icon: GitBranch,
    title: "Roadmap",
    description:
      "Plan in phases and see where a project stands at a glance, without losing the day-to-day detail the task board already tracks.",
    bullets: [
      "Phase-based long-range planning",
      "Status at a glance across a project's lifetime",
      "Stays connected to the tasks underneath it",
    ],
  },
];

// This page has no cookies()/headers() calls, so Next statically prerenders
// it - without this, the pricing section's plan data would be baked in at
// build time and never reflect a price changed later via the admin plan
// editor (src/app/admin/organizations/plan-editor.tsx) until the next
// deploy. Revalidating hourly is enough freshness for prices that change
// rarely, without making the whole marketing page dynamic-per-request.
export const revalidate = 3600;

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
  offers: {
    "@type": "Offer",
    category: "Freemium",
  },
};

export default async function Home() {
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
    <div className="relative flex min-h-screen items-center overflow-hidden bg-gradient-to-br from-background-secondary to-background-tertiary dark:from-background-secondary dark:to-background">
      <WavesBackground className="opacity-60" />
      <div className="container relative z-10 mx-auto px-4 py-20">
        <div className="max-w-5xl mx-auto text-center space-y-12">
          <div className="space-y-6">
            <Image
              src="/assets/guidon-wordmark.png"
              alt="Guidon"
              width={769}
              height={285}
              priority
              className="mx-auto h-24 w-auto dark:invert md:h-28"
            />
            <div className="space-y-3">
              <h1
                className={`${displayFont.className} text-5xl md:text-6xl tracking-tight text-text dark:text-text`}
              >
                Context-First Project Management
              </h1>
              <p className="text-xl text-text-muted dark:text-text-muted max-w-3xl mx-auto leading-relaxed">
                Understand why your project exists. Track decisions, sources, and context alongside your tasks.
              </p>
            </div>
          </div>

          <div className="pt-4">
            <div className="flex gap-4 justify-center flex-wrap">
              <Button size="lg" className="text-base px-8 py-6 h-auto" asChild>
                <Link href="/auth/signup">Get Started</Link>
              </Button>
              <Button size="lg" variant="outline" className="text-base px-8 py-6 h-auto" asChild>
                <Link href="/auth/login">Sign In</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <section className="border-t border-border py-20">
      <div className="container mx-auto max-w-5xl px-4">
        <div className="mb-16 text-center space-y-3">
          <h2 className={`${displayFont.className} text-3xl md:text-4xl`}>
            Everything a project needs to explain itself
          </h2>
          <p className="text-text-muted max-w-2xl mx-auto">
            Tasks alone don&apos;t tell you why a project looks the way it does. Guidon tracks the
            context around the work, not just the work.
          </p>
        </div>

        <div className="space-y-16">
          {FEATURE_SECTIONS.map((feature, index) => {
            const Icon = feature.icon;
            const reversed = index % 2 === 1;
            return (
              <div
                key={feature.title}
                className={`flex flex-col md:flex-row items-center gap-8 md:gap-12 ${
                  reversed ? "md:flex-row-reverse" : ""
                }`}
              >
                <div className="shrink-0">
                  <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <Icon className="w-9 h-9 text-primary" />
                  </div>
                </div>
                <div className="flex-1 text-center md:text-left space-y-3">
                  <h3 className="text-2xl font-semibold">{feature.title}</h3>
                  <p className="text-text-secondary leading-relaxed">{feature.description}</p>
                  <ul className="inline-block text-left text-sm text-text-muted space-y-1.5 pt-1">
                    {feature.bullets.map((bullet) => (
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
    </>
  );
}
