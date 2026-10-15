"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertCircle, Hash, MessageSquare, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { SlackChannelLink } from "@/lib/data/slack-integration";
import { disconnectSlackChannel } from "./slack-actions";

/**
 * Slack channels connected to this project (migration 056). Connecting is
 * done from Slack - `/guidon link` in the channel - so this card explains
 * that, lists the channels and lets owners/admins disconnect them. When the
 * server has no SLACK_SIGNING_SECRET, it says the integration isn't set up.
 */
export function SlackIntegrationCard({
  projectId,
  initialLinks,
  canManage,
  configured,
  connected,
}: {
  projectId: string;
  initialLinks: SlackChannelLink[];
  canManage: boolean;
  configured: boolean;
  connected: boolean;
}) {
  const t = useTranslations("settings");
  const locale = useLocale();
  const [links, setLinks] = useState(initialLinks);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const disconnect = (link: SlackChannelLink) => {
    if (!window.confirm(t("slackDisconnectConfirm"))) return;
    setError(null);
    startTransition(async () => {
      const result = await disconnectSlackChannel(projectId, link.id);
      if (result.error) setError(result.error);
      else setLinks((prev) => prev.filter((l) => l.id !== link.id));
    });
  };

  return (
    <Card id="slack">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          {t("slackTitle")}
        </CardTitle>
        <CardDescription>{t("slackDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {connected && <p className="text-sm text-success">{t("slackConnected")}</p>}
        {!configured ? (
          <p className="text-sm text-muted-foreground">{t("slackNotConfigured")}</p>
        ) : (
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>{t("slackStep1")}</li>
            <li>{t("slackStep2")}</li>
          </ol>
        )}

        {links.length > 0 && (
          <ul className="space-y-2 border-t border-border pt-4">
            {links.map((link) => (
              <li key={link.id} className="flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="flex items-center gap-1 truncate">
                    <Hash className="h-4 w-4 shrink-0 text-muted-foreground" />
                    {link.channelName ?? link.channelId}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {link.teamName ?? link.teamId} · {new Date(link.createdAt).toLocaleDateString(locale)}
                  </p>
                </div>
                {canManage && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => disconnect(link)}
                    disabled={pending}
                    aria-label={t("slackDisconnect")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
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
