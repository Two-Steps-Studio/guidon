"use client";

import { useActionState, useState } from "react";
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
import { createOrganization, type CreateOrganizationState } from "./actions";

const initialState: CreateOrganizationState = { error: null };

/**
 * Client island for the one interactive piece of an otherwise static page.
 * The action itself redirects to the new organization on success, so there
 * is no local "close on success" branch to manage here.
 */
export function CreateOrganizationDialog({
  trigger,
  openOnMount = false,
}: {
  trigger?: React.ReactNode;
  openOnMount?: boolean;
}) {
  const [open, setOpen] = useState(openOnMount);
  // Bumped on every open so <OrgForm key={session}> below fully remounts -
  // see the matching comment in create-project-dialog.tsx for why: without
  // it, useActionState's error from a previous failed attempt survives
  // close/reopen and shows above a freshly emptied form.
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
        {trigger ?? (
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Organization
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Organization</DialogTitle>
          <DialogDescription>Create a new organization to manage your projects</DialogDescription>
        </DialogHeader>
        <OrgForm key={session} onCancel={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function OrgForm({ onCancel }: { onCancel: () => void }) {
  const [state, formAction, pending] = useActionState(createOrganization, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Organization Name</Label>
        <Input id="name" name="name" placeholder="Acme Inc" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="slug">Slug (optional)</Label>
        <Input id="slug" name="slug" placeholder="acme-inc" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Description (optional)</Label>
        <Input id="description" name="description" placeholder="Software development team" />
      </div>
      {state.error && (
        <div className="text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          {state.error}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Creating...
            </>
          ) : (
            "Create"
          )}
        </Button>
      </div>
    </form>
  );
}
