"use client";

import { useActionState, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertCircle, Check, Copy, Send, Trash2, Webhook } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { WEBHOOK_EVENTS, type WebhookEventType } from "@/lib/webhooks/events";
import type { OrganizationWebhook } from "@/lib/data/organization-webhooks";
import {
  createWebhook,
  deleteWebhook,
  sendTestWebhook,
  setWebhookEnabled,
  type CreateWebhookState,
} from "./webhook-actions";

const EVENT_LABEL_KEYS: Record<WebhookEventType, "eventCreated" | "eventStatusChanged" | "eventCompleted"> = {
  "task.created": "eventCreated",
  "task.status_changed": "eventStatusChanged",
  "task.completed": "eventCompleted",
};

const initialState: CreateWebhookState = { error: null, secret: null };

export function WebhooksSection({
  organizationId,
  webhooks,
  maxWebhooks,
  allowHttp,
}: {
  organizationId: string;
  webhooks: OrganizationWebhook[];
  maxWebhooks: number;
  /** Self-hosted installs may target http:// and internal hosts. */
  allowHttp: boolean;
}) {
  const t = useTranslations("organizations.settings.webhooks");
  const [adding, setAdding] = useState(false);
  const [state, formAction, saving] = useActionState(createWebhook.bind(null, organizationId), initialState);

  // Close the form once a webhook is created; the secret is then shown above
  // the list. Adjusted during render, same pattern as AiSettingsForm.
  const [reactedTo, setReactedTo] = useState(state);
  if (state !== reactedTo) {
    setReactedTo(state);
    if (state.secret) setAdding(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Webhook className="h-5 w-5" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {state.secret && reactedTo === state && <SecretNotice secret={state.secret} />}

        {webhooks.length === 0 && !adding && <p className="text-sm text-muted-foreground">{t("empty")}</p>}

        {webhooks.length > 0 && (
          <ul className="divide-y divide-border rounded-md border border-border">
            {webhooks.map((webhook) => (
              <WebhookRow key={webhook.id} organizationId={organizationId} webhook={webhook} />
            ))}
          </ul>
        )}

        {adding ? (
          <form action={formAction} className="space-y-3 rounded-md border border-border p-3">
            <div className="space-y-1">
              <Label htmlFor="webhook-url">{t("urlLabel")}</Label>
              <Input
                id="webhook-url"
                name="url"
                type="url"
                inputMode="url"
                placeholder={allowHttp ? "http://ci.internal:8080/guidon" : "https://example.com/guidon-webhook"}
                required
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">{allowHttp ? t("urlHintSelfHosted") : t("urlHintCloud")}</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="webhook-description">{t("descriptionLabel")}</Label>
              <Input id="webhook-description" name="description" maxLength={200} placeholder={t("descriptionPlaceholder")} />
            </div>
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">{t("eventsLabel")}</legend>
              {WEBHOOK_EVENTS.map((event) => (
                <label key={event} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="events" value={event} defaultChecked className="h-4 w-4 accent-primary" />
                  {t(EVENT_LABEL_KEYS[event])}
                  <code className="hidden text-xs text-muted-foreground sm:inline">{event}</code>
                </label>
              ))}
            </fieldset>
            {state.error && (
              <div role="alert" className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {state.error}
              </div>
            )}
            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? t("saving") : t("save")}
              </Button>
              <Button type="button" variant="outline" onClick={() => setAdding(false)}>
                {t("cancel")}
              </Button>
            </div>
          </form>
        ) : (
          <Button type="button" variant="outline" onClick={() => setAdding(true)} disabled={webhooks.length >= maxWebhooks}>
            {t("add")}
          </Button>
        )}
        {webhooks.length >= maxWebhooks && <p className="text-xs text-muted-foreground">{t("limit", { max: maxWebhooks })}</p>}

        <p className="text-xs text-muted-foreground">{t("signatureHint")}</p>
      </CardContent>
    </Card>
  );
}

function SecretNotice({ secret }: { secret: string }) {
  const t = useTranslations("organizations.settings.webhooks");
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-2 rounded-md border border-warning/40 bg-warning/10 p-3">
      <p className="text-sm font-medium">{t("secretTitle")}</p>
      <p className="text-xs text-muted-foreground">{t("secretHint")}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1 text-xs">{secret}</code>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            void navigator.clipboard.writeText(secret).then(() => setCopied(true));
          }}
          aria-label={t("copySecret")}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

function WebhookRow({ organizationId, webhook }: { organizationId: string; webhook: OrganizationWebhook }) {
  const t = useTranslations("organizations.settings.webhooks");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const run = (action: () => Promise<{ error: string | null; status?: number | null }>, successText?: (status: number | null) => string) => {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setMessage({ ok: false, text: result.error });
      else if (successText) setMessage({ ok: true, text: successText(result.status ?? null) });
    });
  };

  const lastOk = webhook.last_status !== null && webhook.last_status >= 200 && webhook.last_status < 300 && !webhook.last_error;

  return (
    <li className="space-y-2 p-3">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-48 flex-1">
          <p className={cn("truncate font-mono text-sm", !webhook.enabled && "text-muted-foreground line-through")} title={webhook.url}>
            {webhook.url}
          </p>
          {webhook.description && <p className="text-xs text-muted-foreground">{webhook.description}</p>}
          <div className="mt-1 flex flex-wrap gap-1">
            {webhook.events.map((event) => (
              <Badge key={event} variant="outline" className="font-mono text-[10px]">
                {event}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <label className="mr-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={webhook.enabled}
              disabled={pending}
              onChange={(event) => {
                const enabled = event.target.checked;
                run(() => setWebhookEnabled(organizationId, webhook.id, enabled));
              }}
              className="h-4 w-4 accent-primary"
            />
            {t("enabled")}
          </label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              run(
                () => sendTestWebhook(organizationId, webhook.id),
                (status) => t("testDelivered", { status: status ?? "-" })
              )
            }
          >
            <Send className="h-3.5 w-3.5" />
            {t("test")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            aria-label={t("delete")}
            onClick={() => {
              if (window.confirm(t("deleteConfirm"))) run(() => deleteWebhook(organizationId, webhook.id));
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {webhook.last_delivery_at ? (
          <>
            <span className={cn("mr-1 inline-block h-2 w-2 rounded-full", lastOk ? "bg-success" : "bg-danger")} aria-hidden />
            {t("lastDelivery", {
              when: new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
                new Date(webhook.last_delivery_at)
              ),
              status: webhook.last_status ?? "-",
            })}
            {webhook.last_error && <span className="text-destructive"> · {webhook.last_error}</span>}
          </>
        ) : (
          t("neverDelivered")
        )}
      </p>

      {message && (
        <p role="status" className={cn("text-xs", message.ok ? "text-success" : "text-destructive")}>
          {message.text}
        </p>
      )}
    </li>
  );
}
