"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, Bug, Check, Copy, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createReportWidgetKey } from "@/app/profile/api-keys-actions";

/**
 * Sets up the web bug-report widget (public/widget/report.js): mints a
 * reports:write-only key and shows the <script> tag to paste into a site.
 * The key is shown once, like every API key; it's listed (and revocable)
 * under Profile -> API keys afterwards.
 */
export function ReportWidgetCard({ projectId, siteUrl }: { projectId: string; siteUrl: string }) {
  const t = useTranslations("settings");
  const [key, setKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const snippet = `<script src="${siteUrl}/widget/report.js"\n        data-project="${projectId}"\n        data-key="${key ?? "guidon_..."}"\n        async></script>`;

  const create = () => {
    setError(null);
    startTransition(async () => {
      const result = await createReportWidgetKey(projectId);
      if (result.error || !result.fullKey) setError(result.error ?? "Could not create the key.");
      else setKey(result.fullKey);
    });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(t("reportWidgetCopyFailed"));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bug className="h-5 w-5" />
          {t("reportWidgetTitle")}
        </CardTitle>
        <CardDescription>{t("reportWidgetDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>{t("reportWidgetStep1")}</li>
          <li>{t("reportWidgetStep2", { tag: "</body>" })}</li>
          <li>{t("reportWidgetStep3")}</li>
        </ol>

        {!key && (
          <Button type="button" onClick={create} disabled={pending}>
            <KeyRound className="mr-2 h-4 w-4" />
            {t("reportWidgetCreateKey")}
          </Button>
        )}

        <div className="relative">
          <pre className="overflow-x-auto rounded-md border border-border bg-muted p-3 pr-12 text-xs leading-relaxed">
            <code>{snippet}</code>
          </pre>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-1.5 top-1.5"
            onClick={copy}
            aria-label={t("reportWidgetCopy")}
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>

        {key && <p className="text-sm text-muted-foreground">{t("reportWidgetKeyOnce")}</p>}
        <p className="text-xs text-muted-foreground">{t("reportWidgetOptions")}</p>

        {error && (
          <p className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
