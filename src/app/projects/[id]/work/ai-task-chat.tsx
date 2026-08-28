"use client";

import { useState } from "react";
import { AlertCircle, Loader2, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import { normalizeTaskStatus, PRIORITY_CLASSES, PRIORITY_LABELS } from "@/lib/work/task-board";
import { parseTaskProposals, type TaskProposal } from "@/lib/ai/task-proposal-parser";
import { sendTaskChatMessage, type ChatMessage } from "./ai-chat-actions";
import { createTask } from "./actions";
import type { Task } from "@/types/task";

interface ProposalRow extends TaskProposal {
  selected: boolean;
  /** Set once this specific proposal has been created as a real task. */
  taskId: string | null;
}

interface DisplayMessage {
  role: "user" | "assistant";
  /** Full text, including any trailing ```json block - what gets sent back as chat history. */
  rawContent: string;
  /** What renders in the transcript - the model's prose with the block stripped out. */
  content: string;
  proposals?: ProposalRow[];
}

/**
 * The Work board's AI task assistant: a chat with the configured AI
 * provider that can turn a description into a checkbox list of proposed
 * tasks. History lives in this component's state only - closing the sheet
 * clears the conversation, there is no persistence for it.
 */
export function AiTaskChat({
  projectId,
  projectName,
  topLevelTasks,
  onCreated,
}: {
  projectId: string;
  projectName: string;
  topLevelTasks: Task[];
  onCreated: (task: Task) => void;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [addingIndex, setAddingIndex] = useState<number | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  const resetChat = () => {
    setMessages([]);
    setInput("");
    setSendError(null);
    setAddError(null);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) resetChat();
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || sending) return;

    setSendError(null);
    const nextMessages: DisplayMessage[] = [
      ...messages,
      { role: "user", rawContent: trimmed, content: trimmed },
    ];
    setMessages(nextMessages);
    setInput("");
    setSending(true);

    const history: ChatMessage[] = nextMessages.map((message) => ({
      role: message.role,
      content: message.rawContent,
    }));

    const result = await sendTaskChatMessage(projectId, history);
    setSending(false);

    if (result.error) {
      setSendError(result.error);
      return;
    }

    const { prose, proposals } = parseTaskProposals(result.text);
    setMessages((current) => [
      ...current,
      {
        role: "assistant",
        rawContent: result.text,
        content: prose || "(empty response)",
        proposals:
          proposals.length > 0
            ? proposals.map((proposal) => ({ ...proposal, selected: true, taskId: null }))
            : undefined,
      },
    ]);
  };

  const toggleProposal = (messageIndex: number, proposalIndex: number) => {
    setMessages((current) =>
      current.map((message, i) => {
        if (i !== messageIndex || !message.proposals) return message;
        return {
          ...message,
          proposals: message.proposals.map((proposal, j) =>
            j === proposalIndex ? { ...proposal, selected: !proposal.selected } : proposal
          ),
        };
      })
    );
  };

  const handleAddTasks = async (messageIndex: number) => {
    const message = messages[messageIndex];
    if (!message.proposals) return;

    const toCreate = message.proposals
      .map((proposal, index) => ({ ...proposal, index }))
      .filter((proposal) => proposal.selected && !proposal.taskId);
    if (toCreate.length === 0) return;

    setAddingIndex(messageIndex);
    setAddError(null);

    // New tasks land in Backlog - "unscheduled work" is the natural home
    // for freshly proposed tasks nobody has triaged yet. Same sort_order
    // math CreateTaskDialog uses in work-board.tsx: append after the
    // column's current max, +100 per task.
    const backlogTasks = topLevelTasks.filter(
      (task) => normalizeTaskStatus(task.status) === "backlog"
    );
    let maxOrder = backlogTasks.reduce((max, task) => Math.max(max, task.sort_order ?? 0), 0);

    for (const proposal of toCreate) {
      maxOrder += 100;
      const result = await createTask(projectId, {
        title: proposal.title,
        description: proposal.description,
        status: "backlog",
        priority: proposal.priority,
        assigneeId: "",
        dueDate: "",
        sortOrder: maxOrder,
      });

      if (result.error || !result.task) {
        setAddError(result.error ?? "Failed to create task.");
        break;
      }

      const createdTask = result.task;
      setMessages((current) =>
        current.map((current_, i) => {
          if (i !== messageIndex || !current_.proposals) return current_;
          return {
            ...current_,
            proposals: current_.proposals.map((p, j) =>
              j === proposal.index ? { ...p, taskId: createdTask.id } : p
            ),
          };
        })
      );
      onCreated(createdTask);
    }

    setAddingIndex(null);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <Sparkles className="h-4 w-4" />
          AI Task Assistant
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border px-6 py-4">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            AI Task Assistant
          </SheetTitle>
          <SheetDescription>
            Describe work for {projectName} and review proposed tasks before adding them.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {messages.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Paste a spec, describe a feature, or ask a question - the assistant proposes
              tasks you can review and add to the board.
            </p>
          )}

          {messages.map((message, messageIndex) => (
            <div key={messageIndex} className="space-y-2">
              <div
                className={
                  message.role === "user"
                    ? "ml-6 rounded-lg bg-primary/10 px-3 py-2 text-sm"
                    : "mr-6 rounded-lg bg-muted px-3 py-2 text-sm whitespace-pre-wrap"
                }
              >
                {message.content}
              </div>

              {message.proposals && (
                <div className="mr-6 space-y-2 rounded-lg border border-border p-3">
                  {message.proposals.map((proposal, proposalIndex) => (
                    <label key={proposalIndex} className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4"
                        checked={proposal.selected}
                        disabled={!!proposal.taskId}
                        onChange={() => toggleProposal(messageIndex, proposalIndex)}
                      />
                      <span className="flex-1">
                        <span className="flex items-center gap-2">
                          <span className="font-medium">{proposal.title}</span>
                          <Badge variant="outline" className={PRIORITY_CLASSES[proposal.priority]}>
                            {PRIORITY_LABELS[proposal.priority]}
                          </Badge>
                          {proposal.taskId && (
                            <span className="text-xs text-success">Added</span>
                          )}
                        </span>
                        {proposal.description && (
                          <span className="mt-0.5 block text-muted-foreground">
                            {proposal.description}
                          </span>
                        )}
                      </span>
                    </label>
                  ))}

                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={
                      addingIndex === messageIndex ||
                      !message.proposals.some((p) => p.selected && !p.taskId)
                    }
                    onClick={() => handleAddTasks(messageIndex)}
                  >
                    {addingIndex === messageIndex ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Adding...
                      </>
                    ) : (
                      `Add ${message.proposals.filter((p) => p.selected && !p.taskId).length} to board`
                    )}
                  </Button>

                  {addingIndex === null && addError && (
                    <p className="text-xs text-destructive">{addError}</p>
                  )}
                </div>
              )}
            </div>
          ))}

          {sending && (
            <div className="mr-6 flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Thinking...
            </div>
          )}
        </div>

        {sendError && (
          <div
            role="alert"
            className="mx-6 mb-2 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1">{sendError}</span>
          </div>
        )}

        <div className="flex items-end gap-2 border-t border-border px-6 py-4">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleSend();
              }
            }}
            placeholder="Describe the work..."
            className="min-h-[2.5rem] flex-1 resize-none"
            rows={2}
          />
          <Button size="sm" onClick={handleSend} disabled={sending || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
