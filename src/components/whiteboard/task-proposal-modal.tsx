"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { createTask } from "@/app/projects/[id]/work/actions";
import type { TaskProposal } from "@/lib/ai/task-proposal-parser";

const PRIORITIES: TaskProposal["priority"][] = ["low", "medium", "high"];

/**
 * The person reviews and edits the AI's proposals before any task exists.
 * Mounted per result, so the edits start from the new proposals.
 */
export function TaskProposalModal({
  projectId,
  proposals,
  onClose,
}: {
  projectId: string;
  proposals: TaskProposal[];
  onClose: () => void;
}) {
  const t = useTranslations("whiteboard");
  const tWork = useTranslations("work");
  const tCommon = useTranslations("common");
  const [loading, setLoading] = useState(false);
  const [edited, setEdited] = useState(proposals);

  const update = (index: number, patch: Partial<TaskProposal>) =>
    setEdited((current) => current.map((proposal, i) => (i === index ? { ...proposal, ...patch } : proposal)));

  const confirm = async () => {
    setLoading(true);
    try {
      const results = await Promise.all(
        edited.map((proposal) =>
          createTask(projectId, {
            title: proposal.title,
            description: proposal.description,
            priority: proposal.priority,
            status: "todo",
            assigneeId: "",
            dueDate: "",
            sortOrder: 0,
          })
        )
      );
      const failed = results.filter((result) => result.error).length;
      if (failed) toast.error(t("proposalsPartlyCreated", { created: results.length - failed, failed }));
      else toast.success(t("proposalsCreated", { count: results.length }));
      onClose();
    } catch {
      toast.error(t("proposalsFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t("proposalsTitle")}</DialogTitle>
          <DialogDescription>{t("proposalsDescription")}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          {edited.map((proposal, i) => (
            <div key={i} className="p-4 rounded-lg border border-border bg-muted/30 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Input
                  value={proposal.title}
                  onChange={(e) => update(i, { title: e.target.value })}
                  className="font-medium h-8"
                  aria-label={t("proposalTitleLabel")}
                />
                <Select
                  value={proposal.priority}
                  aria-label={t("proposalPriorityLabel")}
                  onChange={(e) => update(i, { priority: e.target.value as TaskProposal["priority"] })}
                >
                  {PRIORITIES.map((priority) => (
                    <option key={priority} value={priority}>
                      {tWork("priority", { priority })}
                    </option>
                  ))}
                </Select>
              </div>
              <Textarea
                value={proposal.description}
                onChange={(e) => update(i, { description: e.target.value })}
                aria-label={t("proposalDescriptionLabel")}
                className="min-h-[80px] text-sm"
              />
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            {tCommon("cancel")}
          </Button>
          <Button onClick={confirm} disabled={loading || edited.length === 0}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("proposalsCreate", { count: edited.length })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
