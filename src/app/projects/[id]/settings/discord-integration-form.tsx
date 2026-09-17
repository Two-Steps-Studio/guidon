"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, MessageSquare } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveDiscordWebhook, removeDiscordWebhook } from "./discord-actions";
import type { DiscordIntegrationInfo } from "@/lib/data/discord-integration";

export function DiscordIntegrationForm({
  projectId,
  initialInfo,
}: {
  projectId: string;
  initialInfo: DiscordIntegrationInfo | null;
}) {
  const t = useTranslations("settings");
  const [info, setInfo] = useState(initialInfo);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setPending(true);
    setError(null);
    const result = await saveDiscordWebhook(projectId, webhookUrl);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setWebhookUrl("");
    setInfo((prev) => ({
      guildId: prev?.guildId ?? null,
      guildName: prev?.guildName ?? null,
      linkedBy: prev?.linkedBy ?? null,
      createdAt: prev?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      hasWebhook: true,
    }));
  };

  const handleRemove = async () => {
    setPending(true);
    setError(null);
    const result = await removeDiscordWebhook(projectId);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setInfo((prev) => (prev ? { ...prev, hasWebhook: false } : prev));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          {t("discordTitle")}
        </CardTitle>
        <CardDescription>{t("discordDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {info?.guildName && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-success" />
            {t("discordLinkedGuild", { guild: info.guildName })}
          </p>
        )}

        {error && (
          <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </p>
        )}

        {info?.hasWebhook ? (
          <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background-secondary px-3 py-2">
            <p className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-success" />
              {t("discordWebhookConfigured")}
            </p>
            <Button size="sm" variant="ghost" onClick={handleRemove} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("discordRemoveWebhook")}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="discord-webhook-url">{t("discordWebhookLabel")}</Label>
            <div className="flex gap-2">
              <Input
                id="discord-webhook-url"
                placeholder="https://discord.com/api/webhooks/..."
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                disabled={pending}
              />
              <Button onClick={handleSave} disabled={pending || !webhookUrl.trim()}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("discordSaveWebhook")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t("discordWebhookHint")}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
