"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, Check, Copy, Loader2, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClaudeCodeConnectionKey } from "./api-keys-actions";

function CopyBlock({ text, copyLabel, errorLabel }: { text: string; copyLabel: string; errorLabel: string }) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
      setTimeout(() => setState("idle"), 2000);
    } catch {
      setState("error");
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex items-start gap-2">
        <code className="flex-1 overflow-x-auto whitespace-pre-wrap break-all rounded bg-background px-2 py-1.5 font-mono text-xs">
          {text}
        </code>
        <Button type="button" size="sm" variant="outline" onClick={copy} aria-label={copyLabel}>
          {state === "copied" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </Button>
      </div>
      {state === "error" && <p className="text-xs text-destructive">{errorLabel}</p>}
    </div>
  );
}

export function ClaudeCodeConnect() {
  const t = useTranslations("profile");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<{ key: string; url: string } | null>(null);

  const handleCreate = async () => {
    setPending(true);
    setError(null);
    try {
      const result = await createClaudeCodeConnectionKey();
      if (result.error || !result.fullKey) {
        setError(result.error ?? t("claudeCodeError"));
        return;
      }
      // The browser's own origin is the address Claude Code has to reach:
      // it is right for the hosted app, a self-hosted domain, and localhost alike.
      setConnection({ key: result.fullKey, url: `${window.location.origin}/api/mcp` });
    } catch {
      setError(t("claudeCodeError"));
    } finally {
      setPending(false);
    }
  };

  // --scope user keeps the key in the user's own Claude Code config instead
  // of a .mcp.json inside a repo, where it could be committed by accident.
  const addCommand = connection
    ? `claude mcp add --transport http --scope user guidon ${connection.url} --header "Authorization: Bearer ${connection.key}"`
    : "";

  return (
    <div className="space-y-3 rounded-md border border-border bg-background-secondary px-3 py-3">
      <div className="flex gap-3">
        <Terminal className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <div>
          <p className="text-sm font-medium">{t("claudeCodeTitle")}</p>
          <p className="text-sm text-muted-foreground">{t("claudeCodeDescription")}</p>
        </div>
      </div>

      {!connection && (
        <div className="space-y-2">
          <Button type="button" size="sm" onClick={handleCreate} disabled={pending}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
            {pending ? t("claudeCodeCreating") : t("claudeCodeCreateButton")}
          </Button>
          {error && (
            <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {error}
            </p>
          )}
        </div>
      )}

      {connection && (
        <ol className="space-y-4 text-sm">
          <li className="space-y-2">
            <p className="font-medium">{t("claudeCodeStep1")}</p>
            <div className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs">
              {t("claudeCodeKeyOnce")}
            </div>
            <CopyBlock text={addCommand} copyLabel={t("claudeCodeCopy")} errorLabel={t("copyKeyError")} />
          </li>
          <li className="space-y-2">
            <p className="font-medium">{t("claudeCodeStep2")}</p>
            <CopyBlock text="claude mcp list" copyLabel={t("claudeCodeCopy")} errorLabel={t("copyKeyError")} />
          </li>
          <li className="space-y-2">
            <p className="font-medium">{t("claudeCodeStep3")}</p>
            <CopyBlock text={t("claudeCodeTryPrompt")} copyLabel={t("claudeCodeCopy")} errorLabel={t("copyKeyError")} />
          </li>
        </ol>
      )}
    </div>
  );
}
