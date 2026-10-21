"use client";

import { useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plug, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ConnectedApp } from "@/lib/oauth/oauth";
import { disconnectApp } from "./connected-apps-actions";

/**
 * Apps the person allowed through OAuth (Claude, ChatGPT, Cursor...).
 * Disconnecting stops their access tokens at once and their refresh token
 * from working.
 */
export function ConnectedAppsSection({ initialApps }: { initialApps: ConnectedApp[] }) {
  const t = useTranslations("profile.connectedApps");
  const format = useFormatter();
  const [apps, setApps] = useState(initialApps);
  const [pending, startTransition] = useTransition();

  const disconnect = (app: ConnectedApp) =>
    startTransition(async () => {
      const { error } = await disconnectApp(app.id);
      if (error) {
        toast.error(error);
        return;
      }
      setApps((current) => current.filter((item) => item.id !== app.id));
      toast.success(t("disconnected", { app: app.client_name }));
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plug className="h-5 w-5" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {apps.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {apps.map((app) => (
              <li key={app.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{app.client_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("connectedOn", { date: format.dateTime(new Date(app.created_at), { dateStyle: "medium" }) })}
                    {app.last_used_at && ` · ${t("lastUsed", { date: format.relativeTime(new Date(app.last_used_at)) })}`}
                  </p>
                  <p className="text-xs text-muted-foreground">{app.scopes.join(", ")}</p>
                </div>
                <Button variant="outline" size="sm" disabled={pending} onClick={() => disconnect(app)}>
                  <Unplug className="h-4 w-4" />
                  {t("disconnect")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
