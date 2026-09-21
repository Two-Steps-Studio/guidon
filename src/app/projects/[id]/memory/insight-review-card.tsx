"use client";

/**
 * Review UI for one pending AI insight (memory_type === 'ai_insight' AND
 * verified === false) - TODO.md §20's Accept / Correct / Reject workflow.
 * Rendered instead of the normal Edit/Delete MemoryCardMenu for pending rows
 * only; once accepted or corrected, the row becomes a verified 'fact' and
 * memory-page.tsx renders it through the regular card path.
 */

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { AlertCircle, Check, Loader2, Pencil, X } from "lucide-react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("memory");
  const tCommon = useTranslations("common");
  const typeConfig = MEMORY_TYPE_CONFIG[memory.memory_type];
  const TypeIcon = typeConfig.icon;

  const [correcting, setCorrecting] = useState(false);
  // Bumped on every open so <CorrectInsightForm key={session}> below fully
  // remounts - useActionState's error otherwise survives close/reopen (this
  // component instance persists for the card's whole lifetime in the list),
  // showing a previous failed attempt's error above a freshly reset form.
  const [session, setSession] = useState(0);
  const [accepting, startAccept] = useTransition();
  const [rejecting, startReject] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

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
      <Card className="border-info/40">
        <CardHeader>
          <div className="flex items-center gap-3 mb-2">
            <TypeIcon className="h-5 w-5 text-muted-foreground" />
            <Badge className={typeConfig.color}>{tCommon("memoryType", { type: memory.memory_type })}</Badge>
            <Badge variant="outline">{t("pendingReviewBadge")}</Badge>
            {memory.confidence != null && (
              <span className="text-xs text-muted-foreground">
                {t("confidence", { percent: Math.round(memory.confidence * 100) })}
              </span>
            )}
          </div>
          <CardDescription className="text-base whitespace-pre-wrap">{memory.content}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {t("generatedOn", { date: new Date(memory.created_at).toLocaleDateString() })}
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
              {t("accept")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setCorrecting(true);
                setSession((s) => s + 1);
              }}
              disabled={busy}
            >
              <Pencil className="h-4 w-4" />
              {t("correct")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleReject}
              disabled={busy}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              {rejecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
              {t("reject")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={correcting} onOpenChange={setCorrecting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("correctDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("correctDialogDescription")}
            </DialogDescription>
          </DialogHeader>
          <CorrectInsightForm
            key={session}
            projectId={projectId}
            memory={memory}
            onClose={() => setCorrecting(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function CorrectInsightForm({
  projectId,
  memory,
  onClose,
}: {
  projectId: string;
  memory: ProjectMemory;
  onClose: () => void;
}) {
  const t = useTranslations("memory");
  const correctWithIds = correctAndAcceptInsight.bind(null, projectId, memory.id);
  const [correctState, correctAction, correctPending] = useActionState(correctWithIds, initialState);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (submittedRef.current && !correctPending && correctState.error === null) {
      onClose();
      submittedRef.current = false;
    }
  }, [correctPending, correctState, onClose]);

  return (
    <form
      action={(formData) => {
        submittedRef.current = true;
        correctAction(formData);
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor={`correct-content-${memory.id}`}>{t("contentLabel")}</Label>
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
        <Button type="button" variant="outline" onClick={onClose} disabled={correctPending}>
          {t("cancel")}
        </Button>
        <Button type="submit" disabled={correctPending}>
          {correctPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {t("saving")}
            </>
          ) : (
            t("acceptAsFact")
          )}
        </Button>
      </div>
    </form>
  );
}
