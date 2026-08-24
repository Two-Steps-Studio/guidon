import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, GitBranch, Network, BrainCircuit } from "lucide-react";
import { WavesBackground } from "@/components/layout/waves-background";
import { hasDirectDatabase } from "@/lib/db/pool";
import { createServiceClient } from "@/lib/supabase-server";

// This page has no cookies()/headers() calls, so Next statically prerenders
// it — without this, the pricing section's plan data would be baked in at
// build time and never reflect a price changed later via the admin plan
// editor (src/app/admin/organizations/plan-editor.tsx) until the next
// deploy. Revalidating hourly is enough freshness for prices that change
// rarely, without making the whole marketing page dynamic-per-request.
export const revalidate = 3600;

interface PlanRow {
  id: string;
  name: string;
  price_cents: number;
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

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "Unlimited storage";
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(0)} GB storage`;
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB storage`;
}

function formatCount(value: number | null, unit: string): string {
  return value === null ? `Unlimited ${unit}` : `${value.toLocaleString()} ${unit}`;
}

function formatPrice(cents: number): string {
  return cents === 0 ? "Free" : `€${(cents / 100).toFixed(2)}`;
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

export default async function Home() {
  // Self-hosted installs have no billing concept at all (mirrors
  // organizations/[id]/billing/page.tsx) — Guidon Cloud pricing has no
  // meaning on someone's own deployment, so the section is skipped rather
  // than showing SaaS prices that don't apply.
  //
  // plans has no `anon` grant (015_subscriptions.sql restricts it to
  // `authenticated`) since it's normally read from inside the authenticated
  // app, not a public marketing page — createServiceClient() is the
  // service-role bypass, safe here because this is read-only public pricing
  // copy, not anything user-scoped.
  const plans = hasDirectDatabase()
    ? []
    : ((await createServiceClient().from("plans").select("*").order("sort_order")).data as PlanRow[] | null) ?? [];

  return (
    <>
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-background-secondary to-background-tertiary dark:from-background-secondary dark:to-background">
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
              className="mx-auto h-16 w-auto dark:invert"
            />
            <div className="space-y-3">
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-text dark:text-text">
                Context-First Project Management
              </h1>
              <p className="text-xl text-text-muted dark:text-text-muted max-w-3xl mx-auto leading-relaxed">
                Understand why your project exists. Track decisions, sources, and context alongside your tasks.
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6 pt-8">
            <Card className="border-border/50 hover:border-primary/50 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <GitBranch className="w-6 h-6 text-primary" />
                </div>
                <CardTitle>Decisions</CardTitle>
                <CardDescription>Track architectural and technical decisions</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-text-secondary dark:text-text-secondary">
                  Never forget why you chose a technology or approach
                </p>
              </CardContent>
            </Card>

            <Card className="border-border/50 hover:border-primary/50 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Network className="w-6 h-6 text-primary" />
                </div>
                <CardTitle>Context</CardTitle>
                <CardDescription>Connect entities through relations</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-text-secondary dark:text-text-secondary">
                  See dependencies, references, and relationships
                </p>
              </CardContent>
            </Card>

            <Card className="border-border/50 hover:border-primary/50 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <BrainCircuit className="w-6 h-6 text-primary" />
                </div>
                <CardTitle>Memory</CardTitle>
                <CardDescription>Preserve project knowledge</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-text-secondary dark:text-text-secondary">
                  Build a searchable knowledge base for your team
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="pt-12 space-y-4">
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

    {plans.length > 0 && (
      <section className="relative overflow-hidden border-t border-border bg-background-secondary/30 py-20">
        <WavesBackground className="opacity-20" />
        <div className="container relative z-10 mx-auto max-w-6xl px-4">
          <div className="text-center mb-12 space-y-2">
            <h2 className="text-3xl font-bold">Simple, transparent pricing</h2>
            <p className="text-text-muted">Start free. Upgrade when you need more.</p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {plans.map((plan) => {
              const isPopular = plan.id === "pro";
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
                      {formatPrice(plan.price_cents)}
                      {plan.price_cents > 0 && (
                        <span className="text-sm font-normal text-text-muted">/mo</span>
                      )}
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
                    <Button
                      className="mt-6 w-full"
                      variant={isPopular ? "default" : "outline"}
                      asChild
                    >
                      <Link href="/auth/signup">Get Started</Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>
    )}
    </>
  );
}
