"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AlertCircle, Loader2, Plus } from "lucide-react";
import { createDecision, type DecisionFormState } from "./actions";
import { DecisionFormFields } from "./decision-form-fields";
import type { ContextEntityType, Decision } from "@/types/context";

const initialState: DecisionFormState = { error: null };

export function CreateDecisionDialog({
  projectId,
  trigger,
  idPrefix = "create-decision",
  defaults,
  link,
  onCreated,
}: {
  projectId: string;
  trigger?: React.ReactNode;
  /** Override when multiple instances can be mounted at once (e.g. one per
   *  task comment in TaskDetailDialog) so their form field ids don't collide. */
  idPrefix?: string;
  defaults?: Partial<Pick<Decision, "title" | "description">>;
  /** When set, the created decision records where it came from and a
   *  context_relations row (`<sourceType> --decided_by--> decision`) is
   *  created alongside it — see createDecision in ./actions.ts. */
  link?: { sourceType: ContextEntityType; sourceId: string };
  onCreated?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const createWithProject = createDecision.bind(null, projectId);
  const [state, formAction, pending] = useActionState(createWithProject, initialState);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (submittedRef.current && !pending && state.error === null) {
      setOpen(false);
      submittedRef.current = false;
      onCreated?.();
    }
  }, [pending, state, onCreated]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Decision
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Decision</DialogTitle>
          <DialogDescription>Record a new project decision</DialogDescription>
        </DialogHeader>
        <form
          action={(formData) => {
            submittedRef.current = true;
            formAction(formData);
          }}
          className="space-y-4"
        >
          <DecisionFormFields idPrefix={idPrefix} defaults={defaults} />
          {link && (
            <>
              <input type="hidden" name="link_source_type" value={link.sourceType} />
              <input type="hidden" name="link_source_id" value={link.sourceId} />
            </>
          )}
          {state.error && (
            <div className="text-sm text-destructive flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              {state.error}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Decision"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
