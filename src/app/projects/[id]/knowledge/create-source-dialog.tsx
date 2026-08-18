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
import { createSource, type SourceFormState } from "./actions";
import { SourceFormFields } from "./source-form-fields";

const initialState: SourceFormState = { error: null };

export function CreateSourceDialog({ projectId, trigger }: { projectId: string; trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const createWithProject = createSource.bind(null, projectId);
  const [state, formAction, pending] = useActionState(createWithProject, initialState);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (submittedRef.current && !pending && state.error === null) {
      setOpen(false);
      submittedRef.current = false;
    }
  }, [pending, state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Plus className="h-4 w-4" />
            New entry
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">New knowledge entry</DialogTitle>
          <DialogDescription>Capture something worth remembering.</DialogDescription>
        </DialogHeader>
        <form
          action={(formData) => {
            submittedRef.current = true;
            formAction(formData);
          }}
          className="space-y-4"
        >
          <SourceFormFields idPrefix="create-source" />
          {state.error && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive flex items-center gap-2"
            >
              <AlertCircle className="h-4 w-4" />
              {state.error}
            </p>
          )}
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Create entry
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
