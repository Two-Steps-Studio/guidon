"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, Bot, Check, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createMcpConnectionKey } from "./api-keys-actions";

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

export const MCP_CLIENTS = ["claude-code", "claude-desktop", "cursor", "vscode", "codex", "gemini", "other"] as const;
export type McpClient = (typeof MCP_CLIENTS)[number];

const CLIENT_NAMES: Record<McpClient, string> = {
  "claude-code": "Claude Code",
  "claude-desktop": "Claude Desktop",
  cursor: "Cursor",
  vscode: "VS Code",
  codex: "Codex CLI",
  gemini: "Gemini CLI",
  other: "",
};

/**
 * What to paste where, per client - each in the shape that client's own docs
 * use for a remote (Streamable HTTP) server with a bearer token. One step is
 * one copy block; `hint` says where it goes.
 */
type StepHint =
  | "mcpStep_claude-code"
  | "mcpVerify_claude-code"
  | "mcpStep_claude-desktop"
  | "mcpStep_cursor"
  | "mcpStep_vscode"
  | "mcpStep_codex_env"
  | "mcpStep_codex"
  | "mcpStep_gemini"
  | "mcpStep_other_url"
  | "mcpStep_other_header";

function setupSteps(client: McpClient, url: string, key: string): { hintKey: StepHint; text: string }[] {
  const json = (value: unknown) => JSON.stringify(value, null, 2);
  switch (client) {
    case "claude-code":
      // --scope user keeps the key in the user's own config instead of a
      // .mcp.json inside a repo, where it could be committed by accident.
      return [
        {
          hintKey: "mcpStep_claude-code",
          text: `claude mcp add --transport http --scope user guidon ${url} --header "Authorization: Bearer ${key}"`,
        },
        { hintKey: "mcpVerify_claude-code", text: "claude mcp list" },
      ];
    case "claude-desktop":
      // Claude Desktop's config only starts local (stdio) servers; mcp-remote
      // bridges to the HTTP endpoint. No space after "Authorization:" in args -
      // Claude Desktop on Windows doesn't quote args, so the value (with its
      // space) goes through env instead (mcp-remote's README).
      return [
        {
          hintKey: "mcpStep_claude-desktop",
          text: json({
            mcpServers: {
              guidon: {
                command: "npx",
                args: ["-y", "mcp-remote", url, "--header", "Authorization:${GUIDON_AUTH}"],
                env: { GUIDON_AUTH: `Bearer ${key}` },
              },
            },
          }),
        },
      ];
    case "cursor":
      return [
        {
          hintKey: "mcpStep_cursor",
          text: json({ mcpServers: { guidon: { url, headers: { Authorization: `Bearer ${key}` } } } }),
        },
      ];
    case "vscode":
      return [
        {
          hintKey: "mcpStep_vscode",
          text: json({ servers: { guidon: { type: "http", url, headers: { Authorization: `Bearer ${key}` } } } }),
        },
      ];
    case "codex":
      // Codex reads the token from an environment variable, never the file.
      return [
        { hintKey: "mcpStep_codex_env", text: `export GUIDON_API_KEY="${key}"` },
        { hintKey: "mcpStep_codex", text: `[mcp_servers.guidon]\nurl = "${url}"\nbearer_token_env_var = "GUIDON_API_KEY"` },
      ];
    case "gemini":
      return [
        {
          hintKey: "mcpStep_gemini",
          text: `gemini mcp add --scope user --transport http --header "Authorization: Bearer ${key}" guidon ${url}`,
        },
      ];
    case "other":
      return [
        { hintKey: "mcpStep_other_url", text: url },
        { hintKey: "mcpStep_other_header", text: `Authorization: Bearer ${key}` },
      ];
  }
}

/**
 * Profile → Integrations: connect any MCP-capable AI app to Guidon's
 * /api/mcp. One click creates a key with exactly the scopes the MCP tools
 * need, then the setup for the chosen app is shown with the key filled in.
 */
export function McpConnect() {
  const t = useTranslations("profile");
  const [client, setClient] = useState<McpClient>("claude-code");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<{ key: string; url: string } | null>(null);

  const clientName = (id: McpClient) => CLIENT_NAMES[id] || t("mcpClientOther");

  const handleCreate = async () => {
    setPending(true);
    setError(null);
    try {
      const result = await createMcpConnectionKey(client === "other" ? "AI app" : CLIENT_NAMES[client]);
      if (result.error || !result.fullKey) {
        setError(result.error ?? t("mcpError"));
        return;
      }
      // The browser's own origin is the address the AI app has to reach:
      // right for the hosted app, a self-hosted domain, and localhost alike.
      setConnection({ key: result.fullKey, url: `${window.location.origin}/api/mcp` });
    } catch {
      setError(t("mcpError"));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-3 rounded-md border border-border bg-background-secondary px-3 py-3">
      <div className="flex gap-3">
        <Bot className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <div>
          <p className="text-sm font-medium">{t("mcpTitle")}</p>
          <p className="text-sm text-muted-foreground">{t("mcpDescription")}</p>
        </div>
      </div>

      <div role="radiogroup" aria-label={t("mcpClientLabel")} className="flex flex-wrap gap-1.5">
        {MCP_CLIENTS.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={client === id}
            onClick={() => setClient(id)}
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
              client === id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background hover:bg-accent"
            )}
          >
            {clientName(id)}
          </button>
        ))}
      </div>

      {!connection && (
        <div className="space-y-2">
          <Button type="button" size="sm" onClick={handleCreate} disabled={pending}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
            {pending ? t("mcpCreating") : t("mcpCreateButton", { client: clientName(client) })}
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
        <div className="space-y-4 text-sm">
          <div className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs">{t("mcpKeyOnce")}</div>
          <ol className="space-y-4">
            {setupSteps(client, connection.url, connection.key).map((step, index) => (
              <li key={step.hintKey} className="space-y-2">
                <p className="font-medium">
                  {index + 1}. {t(step.hintKey)}
                </p>
                <CopyBlock text={step.text} copyLabel={t("mcpCopy")} errorLabel={t("copyKeyError")} />
              </li>
            ))}
            <li className="space-y-2">
              <p className="font-medium">{t("mcpTry")}</p>
              <CopyBlock text={t("mcpTryPrompt")} copyLabel={t("mcpCopy")} errorLabel={t("copyKeyError")} />
            </li>
          </ol>
        </div>
      )}
    </div>
  );
}
