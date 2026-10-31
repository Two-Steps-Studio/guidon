"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { createTask } from "@/app/projects/[id]/work/actions";
import type { TaskProposal } from "@/lib/ai/task-proposal-parser";

interface Proposal {
  title: string;
  description: string;
  priority: string;
}

interface TaskProposalModalProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  proposals: Proposal[];
  onConfirmed: () => void;
}

export function TaskProposalModal({
  open,
  onClose,
  projectId,
  proposals,
  onConfirmed,
}: TaskProposalModalProps) {
  const [loading, setLoading] = useState(false);
  const [editedProposals, setEditedProposals] = useState<Proposal[]>([]);

  React.useEffect(() => {
    if (open) setEditedProposals(proposals);
  }, [open, proposals]);

  const updateProposal = (index: number, field: keyof Proposal, value: string) => {
    setEditedProposals(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const results = await Promise.all(
        editedProposals.map(p =>
          createTask(projectId, {
            title: p.title,
            description: p.description,
            priority: p.priority as any,
            status: "todo",
            assigneeId: "", // Default to unassigned
            dueDate: new Date().toISOString(),
            sortOrder: 0,
          })
        )
      );

      const errors = results.filter(r => r.error).length;
      if (errors > 0) {
        toast.error(`Created ${results.length - errors} tasks, but ${errors} failed.`);
      } else {
        toast.success(`Successfully created ${results.length} tasks!`);
      }
      onConfirmed();
      onClose();
    } catch (e) {
      toast.error("Failed to create tasks");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Review AI Task Proposals</DialogTitle>
          <DialogDescription>
            The AI has proposed the following tasks based on your whiteboard notes.
            Review and edit them before confirming.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          {editedProposals.map((p, i) => (
            <div key={i} className="p-4 rounded-lg border border-border bg-muted/30 space-y-3">
              <div className="flex items-center justify-between">
                <Input
                  value={p.title}
                  onChange={e => updateProposal(i, "title", e.target.value)}
                  className="font-medium h-8"
                  placeholder="Task title"
                />
                <Select
                  value={p.priority}
                  onChange={e => updateProposal(i, "priority", e.target.value)}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </Select>
              </div>
              <Textarea
                value={p.description}
                onChange={e => updateProposal(i, "description", e.target.value)}
                placeholder="Description..."
                className="min-h-[80px] text-sm"
              />
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Tasks
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
