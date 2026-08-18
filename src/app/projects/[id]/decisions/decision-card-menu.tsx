"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AlertCircle, Edit, Loader2, MoreVertical, Trash2 } from "lucide-react";
import { deleteDecision, updateDecision, type DecisionFormState } from "./actions";
import { DecisionFormFields } from "./decision-form-fields";
import type { Decision } from "@/types/context";

const initialState: DecisionFormState = { error: null };

export function DecisionCardMenu({
  projectId,
  decision,
  canDelete,
}: {
  projectId: string;
  decision: Decision;
  canDelete: boolean;
}) {
  const [showEdit, setShowEdit] = useState(false);
  const updateWithIds = updateDecision.bind(null, projectId, decision.id);
  const [state, formAction, pending] = useActionState(updateWithIds, initialState);
  const submittedRef = useRef(false);

  const [deleting, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (submittedRef.current && !pending && state.error === null) {
      setShowEdit(false);
      submittedRef.current = false;
    }
  }, [pending, state]);

  const handleDelete = () => {
    startDelete(async () => {
      const result = await deleteDecision(projectId, decision.id);
      setDeleteError(result.error);
    });
  };

  return (
    <>
      <div className="flex flex-col items-end gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" disabled={deleting}>
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setShowEdit(true)}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </DropdownMenuItem>
            {canDelete && (
              <DropdownMenuItem onClick={handleDelete} className="text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {deleteError && (
          <span className="text-xs text-destructive flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            {deleteError}
          </span>
        )}
      </div>

      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Decision</DialogTitle>
            <DialogDescription>Update decision information</DialogDescription>
          </DialogHeader>
          <form
            action={(formData) => {
              submittedRef.current = true;
              formAction(formData);
            }}
            className="space-y-4"
          >
            <DecisionFormFields idPrefix={`edit-decision-${decision.id}`} defaults={decision} />
            {state.error && (
              <div className="text-sm text-destructive flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                {state.error}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowEdit(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
