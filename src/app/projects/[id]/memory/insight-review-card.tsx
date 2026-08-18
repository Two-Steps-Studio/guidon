"use client";

/**
 * Review UI for one pending AI insight (memory_type === 'ai_insight' AND
 * verified === false) — TODO.md §20's Accept / Correct / Reject workflow.
 * Rendered instead of the normal Edit/Delete MemoryCardMenu for pending rows
 * only; once accepted or corrected, the row becomes a verified 'fact' and
 * memory-page.tsx renders it through the regular card path.
 */

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { AlertCircle, Check, Loader2, Pencil, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  acceptInsight,
  correctAndAcceptInsight,
  rejectInsight,
  type MemoryFormState,
} from "./actions";
import { MEMORY_TYPE_CONFIG } from "./memory-type-config";
import type { ProjectMemory } from "@/types/context";

const initialState: MemoryFormState = { error: null };

export function InsightReviewCard({
  projectId,
  memory,
}: {
  projectId: string;
  memory: ProjectMemory;
}) {
  const typeConfig = MEMORY_TYPE_CONFIG[memory.memory_type];
  const TypeIcon = typeConfig.icon;

  const [correcting, setCorrecting] = useState(false);
  const [accepting, startAccept] = useTransition();
  const [rejecting, startReject] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  const correctWithIds = correctAndAcceptInsight.bind(null, projectId, memory.id);
  const [correctState, correctAction, correctPending] = useActionState(correctWithIds, initialState);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (submittedRef.current && !correctPending && correctState.error === null) {
      setCorrecting(false);
      submittedRef.current = false;
    }
  }, [correctPending, correctState]);

  const handleAccept = () => {
    setActionError(null);
    startAccept(async () => {
      const result = await acceptInsight(projectId, memory.id);
      if (result.error) setActionError(result.error);
    });
  };

  const handleReject = () => {
    setActionError(null);
    startReject(async () => {
      const result = await rejectInsight(projectId, memory.id);
      if (result.error) setActionError(result.error);
    });
  };

  const busy = accepting || rejecting;

  return (
    <>
      <Card className="border-indigo-300 dark:border-indigo-800">
        <CardHeader>
          <div className="flex items-center gap-3 mb-2">
            <TypeIcon className="h-5 w-5 text-muted-foreground" />
            <Badge className={typeConfig.color}>{typeConfig.label}</Badge>
            <Badge variant="outline">Pending review</Badge>
            {memory.confidence != null && (
              <span className="text-xs text-muted-foreground">
                Confidence {Math.round(memory.confidence * 100)}%
              </span>
            )}
          </div>
          <CardDescription className="text-base whitespace-pre-wrap">{memory.content}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Generated {new Date(memory.created_at).toLocaleDateString()}
          </p>

          {actionError && (
            <p role="alert" className="flex items-center gap-1.5 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {actionError}
            </p>
          )}

          <div className="flex gap-2">
            <Button size="sm" onClick={handleAccept} disabled={busy}>
              {accepting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Accept
            </Button>
            <Button size="sm" variant="outline" onClick={() => setCorrecting(true)} disabled={busy}>
              <Pencil className="h-4 w-4" />
              Correct
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleReject}
              disabled={busy}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              {rejecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
              Reject
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={correcting} onOpenChange={setCorrecting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Correct &amp; Accept Insight</DialogTitle>
            <DialogDescription>
              Rewrite the content before it becomes a trusted, verified fact.
            </DialogDescription>
          </DialogHeader>
          <form
            action={(formData) => {
              submittedRef.current = true;
              correctAction(formData);
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor={`correct-content-${memory.id}`}>Content</Label>
              <Textarea
                id={`correct-content-${memory.id}`}
                name="content"
                defaultValue={memory.content}
                rows={4}
                required
              />
            </div>
            {correctState.error && (
              <div className="text-sm text-destructive flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                {correctState.error}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCorrecting(false)} disabled={correctPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={correctPending}>
                {correctPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Accept as Fact"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
