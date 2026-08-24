"use client";

import { useActionState, useRef } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Building2, Loader2 } from "lucide-react";
import { updateOrganizationAvatar, type OrgAvatarState } from "./actions";

const initialState: OrgAvatarState = { error: null };

export function OrgAvatarUpload({
  orgId,
  name,
  avatarUrl,
  canEdit,
}: {
  orgId: string;
  name: string;
  avatarUrl: string | null;
  canEdit: boolean;
}) {
  const updateWithId = updateOrganizationAvatar.bind(null, orgId);
  const [state, formAction, pending] = useActionState(updateWithId, initialState);
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div>
      <form ref={formRef} action={formAction}>
        <input
          ref={inputRef}
          type="file"
          name="avatar"
          accept="image/*"
          className="hidden"
          onChange={() => formRef.current?.requestSubmit()}
        />
        <button
          type="button"
          disabled={!canEdit || pending}
          onClick={() => inputRef.current?.click()}
          className="relative disabled:cursor-default"
          aria-label={canEdit ? `Change image for ${name}` : name}
          title={canEdit ? "Change organization image" : undefined}
        >
          <Avatar className="h-14 w-14 rounded-md">
            <AvatarImage src={avatarUrl || undefined} alt={name} className="object-cover" />
            <AvatarFallback className="rounded-md">
              <Building2 className="h-6 w-6" />
            </AvatarFallback>
          </Avatar>
          {pending && (
            <div className="absolute inset-0 flex items-center justify-center rounded-md bg-background/70">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}
        </button>
      </form>
      {state.error && <p className="mt-1 text-xs text-destructive">{state.error}</p>}
    </div>
  );
}
