"use client";

import { confirmAction } from "@/components/ui/confirm-action";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertCircle, Bug, Check, Copy, KeyRound, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createReportWidgetKey, revokeApiKey, type ApiKeyRow } from "@/app/profile/api-keys-actions";

/**
 * Sets up the web bug-report widget (public/widget/report.js): mints a
 * reports:write key bound to this project and, optionally, to the sites
 * it's installed on (migration 054), and shows the <script> tag to paste.
 * The full key is shown once, like every API key; the list below (the
 * caller's own keys for this project - including the ones the engine
 * plugins' "Set Up In-Game Reports" minted) is where it's revoked.
 */
export function ReportWidgetCard({
  projectId,
  siteUrl,
  initialKeys,
}: {
  projectId: string;
  siteUrl: string;
  initialKeys: ApiKeyRow[];
}) {
  const t = useTranslations("settings");
  const locale = useLocale();
  const [keys, setKeys] = useState(initialKeys);
  const [origins, setOrigins] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const snippet = `<script src="${siteUrl}/widget/report.js"\n        data-project="${projectId}"\n        data-key="${newKey ?? "guidon_..."}"\n        async></script>`;

  const create = () => {
    setError(null);
    startTransition(async () => {
      const result = await createReportWidgetKey(projectId, origins);
      if (result.error || !result.fullKey || !result.row) {
        setError(result.error ?? "Could not create the key.");
        return;
      }
      setNewKey(result.fullKey);
      setKeys((prev) => [result.row!, ...prev]);
      setOrigins("");
    });
  };

  const revoke = async (key: ApiKeyRow) => {
    if (!await confirmAction(t("reportWidgetRevokeConfirm"))) return;
    setError(null);
    startTransition(async () => {
      const result = await revokeApiKey(key.id);
      if (result.error) setError(result.error);
      else setKeys((prev) => prev.filter((k) => k.id !== key.id));
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

        {!newKey && (
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              create();
            }}
          >
            <Label htmlFor="widget-origins">{t("reportWidgetOriginsLabel")}</Label>
            <Input
              id="widget-origins"
              value={origins}
              onChange={(event) => setOrigins(event.target.value)}
              placeholder="shop.example.com, https://staging.example.com"
            />
            <p className="text-xs text-muted-foreground">{t("reportWidgetOriginsHint")}</p>
            <Button type="submit" disabled={pending}>
              <KeyRound className="mr-2 h-4 w-4" />
              {t("reportWidgetCreateKey")}
            </Button>
          </form>
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

        {newKey && <p className="text-sm text-muted-foreground">{t("reportWidgetKeyOnce")}</p>}
        <p className="text-xs text-muted-foreground">{t("reportWidgetOptions")}</p>

        {keys.length > 0 && (
          <div className="space-y-2 border-t border-border pt-4">
            <div>
              <p className="text-sm font-medium">{t("reportWidgetActiveKeys")}</p>
              <p className="text-xs text-muted-foreground">{t("reportWidgetActiveKeysHint")}</p>
            </div>
            <ul className="space-y-2">
              {keys.map((key) => (
                <li key={key.id} className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate">{key.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      <span className="font-mono">{key.key_prefix}…</span>
                      {" · "}
                      {key.allowed_origins?.length ? key.allowed_origins.join(", ") : t("reportWidgetAnySite")}
                      {" · "}
                      {new Date(key.created_at).toLocaleDateString(locale)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => revoke(key)}
                    disabled={pending}
                    aria-label={t("reportWidgetRevoke")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

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
