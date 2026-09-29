import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Puzzle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ClaudeCodeConnect } from "./claude-code-connect";

export async function IntegrationsSection() {
  const t = await getTranslations("profile");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("integrationsTitle")}</CardTitle>
        <CardDescription>{t("integrationsDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ClaudeCodeConnect />
        <div className="flex flex-col items-start justify-between gap-3 rounded-md border border-border bg-background-secondary px-3 py-3 sm:flex-row sm:items-center">
          <div className="flex gap-3">
            <Puzzle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <div>
              <p className="text-sm font-medium">{t("pluginsTitle")}</p>
              <p className="text-sm text-muted-foreground">{t("pluginsDescription")}</p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <Link href="/plugins">{t("pluginsButton")}</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
