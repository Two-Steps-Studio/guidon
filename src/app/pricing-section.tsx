"use client";

import { useEffect, useRef, useState } from "react";
import { CtaLink } from "@/components/landing/cta-link";
import { Fraunces } from "next/font/google";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BILLING_INTERVALS, type BillingInterval } from "@/lib/billing/billing-core";
import { publicPlanPrice, type PublicPlanPrice } from "@/lib/billing/public-pricing";
import { RevealGroup } from "@/components/landing/reveal-group";
import { Check } from "lucide-react";

// Matches the display font used for headlines on the rest of the landing
// page (src/app/page.tsx) - kept as a separate call since next/font/google
// requires the call at module scope in each file that uses it.
const displayFont = Fraunces({ subsets: ["latin"], weight: ["600"] });

export interface PlanRow {
  id: string;
  name: string;
  /** null means custom/"contact us" pricing (034_enterprise_plan.sql) - never a stand-in for 0 (Free). */
  price_cents: number | null;
  price_pln_cents: number | null;
  project_limit: number | null;
  task_limit_per_project: number | null;
  /** Absent until migration 049 has run. */
  member_limit_per_project?: number | null;
  storage_limit_bytes: number | null;
  /** Seats (049). Absent until that migration runs - the landing page selects `*`. */
  member_limit?: number | null;
  has_ai_features: boolean;
  has_github_integration: boolean;
  has_advanced_analytics: boolean;
  has_team_roles: boolean;
  has_audit_logs: boolean;
  has_priority_support: boolean;
}

type Currency = "EUR" | "PLN";

type PricingTranslator = ReturnType<typeof useTranslations>;

function formatBytes(bytes: number | null, t: PricingTranslator): string {
  if (bytes === null) return t("unlimitedStorage");
  if (bytes >= 1024 * 1024 * 1024) return t("gbStorage", { count: Math.round(bytes / (1024 * 1024 * 1024)) });
  return t("mbStorage", { count: Math.round(bytes / (1024 * 1024)) });
}

function formatPrice({ cents, currency }: { cents: number | null | undefined; currency: Currency }, t: PricingTranslator): string {
  if (cents === undefined) return t("unavailable");
  if (cents === null) return t("contactUs");
  if (cents === 0) return t("free");
  const amount = (cents / 100).toFixed(2);
  return currency === "EUR" ? `€${amount}` : `${amount} zł`;
}

function planFeatures(plan: PlanRow, t: PricingTranslator): string[] {
  const features = [
    plan.project_limit === null ? t("unlimitedProjects") : t("projectsCount", { count: plan.project_limit }),
    ...(plan.member_limit === undefined
      ? []
      : [plan.member_limit === null ? t("unlimitedMembers") : t("membersCount", { count: plan.member_limit })]),
    plan.task_limit_per_project === null
      ? t("unlimitedTasksPerProject")
      : t("tasksPerProjectCount", { count: plan.task_limit_per_project }),
  ];
  if (plan.member_limit_per_project !== undefined) {
    features.push(
      plan.member_limit_per_project === null
        ? t("unlimitedMembersPerProject")
        : t("membersPerProjectCount", { count: plan.member_limit_per_project })
    );
  }
  features.push(formatBytes(plan.storage_limit_bytes, t));
  if (plan.has_ai_features) features.push(t("aiTaskApi"));
  if (plan.has_github_integration) features.push(t("githubIntegration"));
  if (plan.has_advanced_analytics) features.push(t("advancedAnalytics"));
  if (plan.has_team_roles) features.push(t("teamRoles"));
  if (plan.has_audit_logs) features.push(t("auditLogs"));
  if (plan.has_priority_support) features.push(t("prioritySupport"));
  return features;
}

const CURRENCIES: Currency[] = ["EUR", "PLN"];

/** `checkoutAvailable` false (Stripe not configured yet): paid plans start free instead of ending at a checkout error. */
export function PricingSection({ plans, prices = [], checkoutAvailable = true }: { plans: PlanRow[]; prices?: PublicPlanPrice[]; checkoutAvailable?: boolean }) {
  const t = useTranslations("landing.pricing");
  const [currency, setCurrency] = useState<Currency>("EUR");
  const [interval, setInterval] = useState<BillingInterval>("month");
  const sectionRef = useRef<HTMLElement>(null);
  const [showNavigator, setShowNavigator] = useState(false);
  useEffect(() => {
    const section = sectionRef.current;
    const hero = document.querySelector('[data-home-hero]');
    if (!section || !hero || !window.IntersectionObserver) return;
    let heroPassed = false, pricingVisible = false;
    const update = () => setShowNavigator(heroPassed && !pricingVisible);
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.target === hero) heroPassed = entry.boundingClientRect.bottom <= 0;
        else pricingVisible = entry.isIntersecting;
      }
      update();
    });
    observer.observe(hero); observer.observe(section);
    return () => observer.disconnect();
  }, []);
  const periods = (navigate = false) => <div role="group" aria-label={t("intervalLabel")} className="inline-flex max-w-full flex-wrap justify-center gap-1 rounded-xl border border-border bg-background p-1">
    {BILLING_INTERVALS.map(option => <button key={option} type="button" aria-pressed={interval === option}
      onClick={() => { setInterval(option); if (navigate) { sectionRef.current?.focus({preventScroll:true}); sectionRef.current?.scrollIntoView({block:"start"}); } }}
      className={`min-h-11 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${interval === option ? "bg-primary text-primary-foreground" : "text-text-secondary hover:bg-muted"}`}>
      {t(`interval_${option}`)}
    </button>)}
  </div>;

  return (
    <section ref={sectionRef} tabIndex={-1} id="pricing" className="relative scroll-mt-16 overflow-hidden border-t border-border bg-background-secondary/30 py-20">
      <div className="container relative z-10 mx-auto max-w-6xl px-4">
        <div className="scrim mx-auto mb-12 max-w-3xl space-y-4 rounded-2xl px-6 py-6 text-center">
          <h2 className={`${displayFont.className} text-3xl md:text-4xl`}>{t("title")}</h2>
          <p className="text-text-secondary">{t("subtitle")}</p>
          {!checkoutAvailable && <p className="text-sm text-text-secondary" role="note">{t("paidSoon")}</p>}

          <div>{periods()}</div>
          <p className="text-xs text-text-muted">{t("actualPrices")}</p>
          <div
            role="group"
            aria-label={t("currencyLabel")}
            className="inline-flex rounded-lg border border-border p-1"
          >
            {CURRENCIES.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={currency === option}
                onClick={() => setCurrency(option)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                  currency === option
                    ? "bg-primary text-primary-foreground"
                    : "text-text-muted hover:text-text"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <RevealGroup className="grid gap-6 md:grid-cols-2 lg:grid-cols-5">
          {plans.map((plan) => {
            const isPopular = plan.id === "pro";
            const price = publicPlanPrice(plan, prices, interval, currency);
            return (
              <Card
                key={plan.id}
                className={`relative flex flex-col ${isPopular ? "border-primary shadow-lg shadow-primary/10" : "border-border/50"}`}
              >
                {isPopular && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">{t("mostPopular")}</Badge>
                )}
                <CardHeader>
                  <CardTitle>{plan.name}</CardTitle>
                  <div className="text-3xl font-bold">
                    {formatPrice(price, t)}
                    {price.cents != null && price.cents > 0 && (
                      <span className="text-sm font-normal text-text-muted">{t(`per_${interval}`)}</span>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col">
                  <ul className="flex-1 space-y-2 text-sm text-text-secondary">
                    {planFeatures(plan, t).map((feature) => (
                      <li key={feature} className="flex items-center gap-2">
                        <Check className="h-4 w-4 shrink-0 text-primary" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Button className="mt-6 w-full" variant={isPopular ? "default" : "outline"} asChild>
                    {/* landing.pricing.getStarted is a separate key from the
                        hero CTA (landing.getStarted in page.tsx) - they read
                        identically in English today, but are independently
                        translatable so a locale can word the pricing-card
                        CTA differently from the hero without touching both. */}
                    {/* A paid plan goes on to /upgrade after signing up (or
                        straight there for someone already signed in - see
                        redirectSignedIn in proxy.ts), which opens the
                        organization's billing page with this plan picked. */}
                    <CtaLink
                      cta={price.cents ? "pricing-paid" : "pricing-free"}
                      href={
                        price.cents != null && price.cents > 0 && checkoutAvailable
                          ? `/auth/signup?redirect=${encodeURIComponent(`/upgrade?plan=${encodeURIComponent(plan.id)}&interval=${interval}`)}`
                          : price.cents == null ? "/contact" : "/start"
                      }
                    >
                      {t(price.cents === undefined || price.cents === null ? "contactUs" : "getStarted")}
                    </CtaLink>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </RevealGroup>
      </div>
      {showNavigator && <aside aria-label={t("browsePlans")} className="fixed inset-x-0 bottom-[max(.75rem,env(safe-area-inset-bottom))] z-40 mx-auto w-fit max-w-[calc(100%-1rem)] rounded-2xl border border-border bg-background p-2 shadow-xl">
        <p className="mb-1 text-center text-xs font-medium text-text-secondary">{t("browsePlans")}</p>
        {periods(true)}
      </aside>}
    </section>
  );
}
