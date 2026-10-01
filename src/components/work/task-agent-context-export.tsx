"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Bot, Check, Copy, Loader2 } from "lucide-react";
import { getTaskAgentContext } from "@/lib/context/agent-context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

/**
 * "Export agent context" (TODO.md §18): a button that generates the task's
 * agent-ready Markdown on demand - not alongside Why/comments, since most
 * task views never open it - and shows it in a copyable dialog.
 */
export function TaskAgentContextExport({ projectId, taskId }: { projectId: string; taskId: string }) {
  const t = useTranslations("work");
  const [agentContextOpen, setAgentContextOpen] = useState(false);
  const [agentContextMarkdown, setAgentContextMarkdown] = useState("");
  const [agentContextLoading, setAgentContextLoading] = useState(false);
  const [agentContextError, setAgentContextError] = useState<string | null>(null);
  const [agentContextCopied, setAgentContextCopied] = useState(false);

  const handleExportAgentContext = async () => {
    setAgentContextOpen(true);
    setAgentContextLoading(true);
    setAgentContextError(null);
    setAgentContextCopied(false);

    try {
      const result = await getTaskAgentContext(projectId, taskId);
      if (result.error) throw new Error(result.error);
      setAgentContextMarkdown(result.markdown);
    } catch (err) {
      setAgentContextError(err instanceof Error ? err.message : t("failedToGenerateAgentContext"));
    } finally {
      setAgentContextLoading(false);
    }
  };

  const handleCopyAgentContext = async () => {
    try {
      await navigator.clipboard.writeText(agentContextMarkdown);
      setAgentContextCopied(true);
      setTimeout(() => setAgentContextCopied(false), 2000);
    } catch {
      setAgentContextError(t("failedToCopyToClipboard"));
    }
  };

  return (
    <>
          <section aria-label={t("agentContextAria")} className="border-t border-border pt-4">
            <Button type="button" variant="outline" size="sm" onClick={() => void handleExportAgentContext()}>
              <Bot className="h-4 w-4" />
              {t("exportAgentContext")}
            </Button>
          </section>

      <Dialog open={agentContextOpen} onOpenChange={setAgentContextOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("agentContextDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("agentContextDialogDescription")}
            </DialogDescription>
          </DialogHeader>

          {agentContextLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t("generatingContext")}
            </p>
          ) : agentContextError ? (
            <p role="alert" className="text-sm text-destructive">
              {agentContextError}
            </p>
          ) : (
            <div className="space-y-3">
              <Textarea
                readOnly
                rows={16}
                value={agentContextMarkdown}
                className="font-mono text-xs"
                onFocus={(event) => event.currentTarget.select()}
              />
              <div className="flex justify-end">
                <Button type="button" size="sm" onClick={() => void handleCopyAgentContext()}>
                  {agentContextCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {agentContextCopied ? t("copied") : t("copyToClipboard")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
