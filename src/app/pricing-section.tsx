"use client";

import { useState } from "react";
import Link from "next/link";
import { Fraunces } from "next/font/google";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";
import { WavesBackground } from "@/components/layout/waves-background";

// Matches the display font used for headlines on the rest of the landing
// page (src/app/page.tsx) - kept as a separate call since next/font/google
// requires the call at module scope in each file that uses it.
const displayFont = Fraunces({ subsets: ["latin"], weight: ["600"] });

export interface PlanRow {
  id: string;
  name: string;
  price_cents: number;
  price_pln_cents: number | null;
  project_limit: number | null;
  task_limit_per_project: number | null;
  storage_limit_bytes: number | null;
  has_ai_features: boolean;
  has_github_integration: boolean;
  has_advanced_analytics: boolean;
  has_team_roles: boolean;
  has_audit_logs: boolean;
  has_priority_support: boolean;
}

type Currency = "EUR" | "PLN";

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "Unlimited storage";
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(0)} GB storage`;
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB storage`;
}

function formatCount(value: number | null, unit: string): string {
  return value === null ? `Unlimited ${unit}` : `${value.toLocaleString()} ${unit}`;
}

function priceFor(plan: PlanRow, currency: Currency): number {
  if (currency === "PLN") return plan.price_pln_cents ?? plan.price_cents;
  return plan.price_cents;
}

function formatPrice(cents: number, currency: Currency): string {
  if (cents === 0) return "Free";
  const amount = (cents / 100).toFixed(2);
  return currency === "EUR" ? `€${amount}` : `${amount} zł`;
}

function planFeatures(plan: PlanRow): string[] {
  const features = [
    formatCount(plan.project_limit, "projects"),
    formatCount(plan.task_limit_per_project, "tasks per project"),
    formatBytes(plan.storage_limit_bytes),
  ];
  if (plan.has_ai_features) features.push("AI Task API");
  if (plan.has_github_integration) features.push("GitHub integration");
  if (plan.has_advanced_analytics) features.push("Advanced analytics");
  if (plan.has_team_roles) features.push("Team roles");
  if (plan.has_audit_logs) features.push("Audit logs");
  if (plan.has_priority_support) features.push("Priority support");
  return features;
}

const CURRENCIES: Currency[] = ["EUR", "PLN"];

export function PricingSection({ plans }: { plans: PlanRow[] }) {
  const [currency, setCurrency] = useState<Currency>("EUR");

  return (
    <section className="relative overflow-hidden border-t border-border bg-background-secondary/30 py-20">
      <WavesBackground className="opacity-20" />
      <div className="container relative z-10 mx-auto max-w-6xl px-4">
        <div className="mb-12 space-y-4 text-center">
          <h2 className={`${displayFont.className} text-3xl md:text-4xl`}>Simple, transparent pricing</h2>
          <p className="text-text-muted">Start free. Upgrade when you need more.</p>

          <div
            role="group"
            aria-label="Currency"
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

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan) => {
            const isPopular = plan.id === "pro";
            const cents = priceFor(plan, currency);
            return (
              <Card
                key={plan.id}
                className={`relative flex flex-col ${isPopular ? "border-primary shadow-lg shadow-primary/10" : "border-border/50"}`}
              >
                {isPopular && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">Most popular</Badge>
                )}
                <CardHeader>
                  <CardTitle>{plan.name}</CardTitle>
                  <div className="text-3xl font-bold">
                    {formatPrice(cents, currency)}
                    {cents > 0 && <span className="text-sm font-normal text-text-muted">/mo</span>}
                  </div>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col">
                  <ul className="flex-1 space-y-2 text-sm text-text-secondary">
                    {planFeatures(plan).map((feature) => (
                      <li key={feature} className="flex items-center gap-2">
                        <Check className="h-4 w-4 shrink-0 text-primary" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Button className="mt-6 w-full" variant={isPopular ? "default" : "outline"} asChild>
                    <Link href="/auth/signup">Get Started</Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
