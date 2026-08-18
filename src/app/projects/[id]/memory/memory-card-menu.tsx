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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, Edit, Loader2, MoreVertical, Trash2 } from "lucide-react";
import { deleteMemory, updateMemory, type MemoryFormState } from "./actions";
import { MEMORY_TYPE_CONFIG } from "./memory-type-config";
import type { MemoryType } from "@/types/context";

const initialState: MemoryFormState = { error: null };

/** Per-row edit dialog + delete, for one memory entry. */
export function MemoryCardMenu({
  projectId,
  memoryId,
  content,
  memoryType,
}: {
  projectId: string;
  memoryId: string;
  content: string;
  memoryType: MemoryType;
}) {
  const [showEdit, setShowEdit] = useState(false);
  const updateWithIds = updateMemory.bind(null, projectId, memoryId);
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
      const result = await deleteMemory(projectId, memoryId);
      setDeleteError(result.error);
    });
  };

  return (
    <>
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
          <DropdownMenuItem onClick={handleDelete} className="text-destructive">
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {deleteError && (
        <p className="text-xs text-destructive mt-1 flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          {deleteError}
        </p>
      )}

      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Memory</DialogTitle>
            <DialogDescription>Update memory entry</DialogDescription>
          </DialogHeader>
          <form
            action={(formData) => {
              submittedRef.current = true;
              formAction(formData);
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor={`editContent-${memoryId}`}>Content</Label>
              <Textarea id={`editContent-${memoryId}`} name="content" defaultValue={content} rows={4} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`editType-${memoryId}`}>Type</Label>
              <select
                id={`editType-${memoryId}`}
                name="memory_type"
                defaultValue={memoryType}
                className="w-full px-3 py-2 border rounded-md bg-background"
              >
                {Object.entries(MEMORY_TYPE_CONFIG).map(([type, config]) => (
                  <option key={type} value={type}>
                    {config.label}
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
