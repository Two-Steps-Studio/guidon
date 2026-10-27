"use client";

import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { McpConnect } from "@/app/profile/mcp-connect";

/**
 * "Connect your agent" on a project's board: the Profile MCP setup (key with
 * the MCP scopes, per-app instructions, connection check, revoke) in a
 * dialog, with the prompt to try pointed at this project. The key is the
 * person's own and acts under RLS as them - not bound to this project,
 * because /api/mcp doesn't accept project-bound keys yet.
 */
export function ConnectAgentDialog({
  open,
  onOpenChange,
  projectName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectName: string;
}) {
  const t = useTranslations("work");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("connectAgentTitle")}</DialogTitle>
          <DialogDescription>{t("connectAgentDescription")}</DialogDescription>
        </DialogHeader>
        <McpConnect projectName={projectName} embedded />
      </DialogContent>
    </Dialog>
  );
}
