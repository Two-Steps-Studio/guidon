import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background-secondary to-background-tertiary dark:from-background-secondary dark:to-background">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <div className="space-y-4">
            <Image
              src="/assets/guidon-wordmark.png"
              alt="Guidon"
              width={769}
              height={285}
              priority
              className="mx-auto h-14 w-auto dark:invert"
            />
            <p className="text-xl text-text-secondary dark:text-text-secondary">
              Context-First Project Management
            </p>
            <p className="text-lg text-text-muted dark:text-text-muted max-w-2xl mx-auto">
              Understand why your project exists. Track decisions, sources, and context alongside your tasks.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 pt-8">
            <Card>
              <CardHeader>
                <CardTitle>Decisions</CardTitle>
                <CardDescription>Track architectural and technical decisions</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-text-secondary dark:text-text-secondary">
                  Never forget why you chose a technology or approach
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Context</CardTitle>
                <CardDescription>Connect entities through relations</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-text-secondary dark:text-text-secondary">
                  See dependencies, references, and relationships
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
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

          <div className="pt-8 space-y-4">
            <div className="flex gap-4 justify-center">
              <Button size="lg" asChild>
                <Link href="/auth/signup">Get Started</Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/auth/login">Sign In</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
