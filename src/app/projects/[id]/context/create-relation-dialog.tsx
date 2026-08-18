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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Loader2, Plus } from "lucide-react";
import { createRelation, type RelationFormState } from "./actions";
import { ENTITY_TYPE_LABELS, ENTITY_TYPE_OPTIONS, RELATION_TYPE_LABELS, RELATION_TYPE_OPTIONS } from "./relation-config";

const initialState: RelationFormState = { error: null };

export function CreateRelationDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const createWithProject = createRelation.bind(null, projectId);
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
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          New Relation
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Relation</DialogTitle>
          <DialogDescription>Link two project entities together</DialogDescription>
        </DialogHeader>
        <form
          action={(formData) => {
            submittedRef.current = true;
            formAction(formData);
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="sourceType">Source Type</Label>
            <select
              id="sourceType"
              name="source_type"
              defaultValue="decision"
              className="w-full px-3 py-2 border rounded-md bg-background"
            >
              {ENTITY_TYPE_OPTIONS.map((type) => (
                <option key={type} value={type}>
                  {ENTITY_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sourceId">Source ID</Label>
            <Input id="sourceId" name="source_id" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="targetType">Target Type</Label>
            <select
              id="targetType"
              name="target_type"
              defaultValue="task"
              className="w-full px-3 py-2 border rounded-md bg-background"
            >
              {ENTITY_TYPE_OPTIONS.map((type) => (
                <option key={type} value={type}>
                  {ENTITY_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="targetId">Target ID</Label>
            <Input id="targetId" name="target_id" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="relationType">Relation Type</Label>
            <select
              id="relationType"
              name="relation_type"
              defaultValue="depends_on"
              className="w-full px-3 py-2 border rounded-md bg-background"
            >
              {RELATION_TYPE_OPTIONS.map((type) => (
                <option key={type} value={type}>
                  {RELATION_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>
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
                "Create Relation"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
