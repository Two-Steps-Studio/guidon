import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GitBranch, Network, BrainCircuit } from "lucide-react";
import { HeroBackground } from "@/components/layout/hero-background";

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-background-secondary to-background-tertiary dark:from-background-secondary dark:to-background">
      <HeroBackground />
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
  );
}
