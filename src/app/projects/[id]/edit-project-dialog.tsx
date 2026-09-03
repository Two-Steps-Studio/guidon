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
import { AlertCircle, Loader2, Settings } from "lucide-react";
import { updateProject, type UpdateProjectState } from "./actions";

const initialState: UpdateProjectState = { error: null };

type EditableProject = {
  id: string;
  name: string;
  description: string | null;
};

/**
 * Client island: the rest of the project overview page is a Server
 * Component, but a dialog with local open/close state and an in-flight
 * submission has to run in the browser. The mutation itself is a Server
 * Action, so this component holds no Supabase client of its own.
 */
export function EditProjectDialog({ project }: { project: EditableProject }) {
  const [open, setOpen] = useState(false);
  // Bumped on every open so <EditProjectForm key={session}> below fully
  // remounts - useActionState's error otherwise survives close/reopen (this
  // component itself never unmounts), showing a previous failed attempt's
  // error above a freshly reset form.
  const [session, setSession] = useState(0);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setSession((s) => s + 1);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Settings className="h-4 w-4 mr-2" />
          Edit Project
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Project</DialogTitle>
          <DialogDescription>Update project information</DialogDescription>
        </DialogHeader>
        <EditProjectForm key={session} project={project} onClose={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function EditProjectForm({ project, onClose }: { project: EditableProject; onClose: () => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const updateProjectWithId = updateProject.bind(null, project.id);
  const [state, formAction, pending] = useActionState(updateProjectWithId, initialState);

  const submittedRef = useRef(false);

  useEffect(() => {
    if (submittedRef.current && !pending && state.error === null) {
      onClose();
      submittedRef.current = false;
    }
  }, [pending, state, onClose]);

  return (
    <form
      ref={formRef}
      action={(formData) => {
        submittedRef.current = true;
        formAction(formData);
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="editName">Project Name</Label>
        <Input id="editName" name="name" defaultValue={project.name} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="editDescription">Description</Label>
        <Input
          id="editDescription"
          name="description"
          defaultValue={project.description ?? ""}
        />
      </div>
      {state.error && (
        <div className="text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          {state.error}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
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
  );
}
