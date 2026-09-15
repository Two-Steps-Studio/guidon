"use client";

import { useActionState, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Check, Copy, KeyRound, Trash2 } from "lucide-react";
import { API_KEY_SCOPES } from "@/lib/api/scopes";
import { createApiKey, revokeApiKey, type ApiKeyRow, type CreateApiKeyState } from "./api-keys-actions";

const initialState: CreateApiKeyState = { error: null, fullKey: null, row: null };

export function ApiKeysSection({ initialKeys }: { initialKeys: ApiKeyRow[] }) {
  const t = useTranslations("profile");
  const [keys, setKeys] = useState(initialKeys);
  const [state, formAction, creating] = useActionState(createApiKey, initialState);
  const [revoking, startRevoke] = useTransition();
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  // useState(initialKeys) only re-seeds on remount, so revalidatePath("/profile")
  // alone doesn't get the freshly created key into this list - without this,
  // the "copy it now" banner appeared but the key was invisible below it
  // until a manual reload, looking like creation had silently failed.
  // Adjusted during render rather than in an effect (React's own recommended
  // pattern - see the matching comment in ai-settings-form.tsx) - `state.row`
  // is null on first render, so this never fires on mount.
  const [reactedTo, setReactedTo] = useState(state);
  if (state !== reactedTo) {
    setReactedTo(state);
    if (state.row) {
      const newRow = state.row;
      setKeys((prev) => (prev.some((k) => k.id === newRow.id) ? prev : [newRow, ...prev]));
    }
  }

  const handleCopyFullKey = async () => {
    if (!state.fullKey) return;
    try {
      await navigator.clipboard.writeText(state.fullKey);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 2000);
    } catch {
      // A rejected clipboard write (permission denied, document not
      // focused) previously failed silently - this key is shown exactly
      // once, so a silent failure here means the user believes they copied
      // it and loses it for good.
      setCopyState("error");
    }
  };

  const handleRevoke = (keyId: string) => {
    startRevoke(async () => {
      await revokeApiKey(keyId);
      setKeys((prev) => prev.map((k) => (k.id === keyId ? { ...k, revoked_at: new Date().toISOString() } : k)));
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("apiKeysTitle")}</CardTitle>
        <CardDescription>{t("apiKeysDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {state.fullKey && (
          <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
            <p className="mb-2 font-medium">{t("copyKeyWarning")}</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded bg-background px-2 py-1 font-mono text-xs">
                {state.fullKey}
              </code>
              <Button type="button" size="sm" variant="outline" onClick={handleCopyFullKey}>
                {copyState === "copied" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </Button>
            </div>
            {copyState === "error" && (
              <p className="mt-2 text-xs text-destructive">
                {t("copyKeyError")}
              </p>
            )}
          </div>
        )}

        <form action={formAction} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="key-name">{t("keyNameLabel")}</Label>
            <Input id="key-name" name="name" placeholder={t("keyNamePlaceholder")} required />
          </div>
          <div className="space-y-1">
            <Label>{t("scopesLabel")}</Label>
            <div className="grid grid-cols-2 gap-2">
              {API_KEY_SCOPES.map((scope) => (
                <label key={scope} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name={`scope:${scope}`} className="h-4 w-4" />
                  {scope}
                </label>
              ))}
            </div>
          </div>
          {state.error && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {state.error}
            </div>
          )}
          <Button type="submit" disabled={creating}>
            <KeyRound className="h-4 w-4 mr-2" />
            {creating ? t("creating") : t("createApiKeyButton")}
          </Button>
        </form>

        <div className="space-y-2">
          {keys.length === 0 && <p className="text-sm text-muted-foreground">{t("noApiKeysYet")}</p>}
          {keys.map((key) => (
            <div key={key.id} className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{key.name}</span>
                  {key.revoked_at && <Badge variant="secondary">{t("revokedBadge")}</Badge>}
                </div>
                <p className="font-mono text-xs text-muted-foreground">{key.key_prefix}...</p>
                <p className="text-xs text-muted-foreground">
                  {t("createdOn", { date: new Date(key.created_at).toLocaleDateString() })}
                  {" · "}
                  {key.last_used_at
                    ? t("lastUsedOn", { date: new Date(key.last_used_at).toLocaleDateString() })
                    : t("neverUsed")}
                </p>
              </div>
              {!key.revoked_at && (
                <Button size="sm" variant="outline" disabled={revoking} onClick={() => handleRevoke(key.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
