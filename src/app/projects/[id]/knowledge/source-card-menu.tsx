"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
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
import { deleteSource, updateSource, type SourceFormState } from "./actions";
import { SourceFormFields } from "./source-form-fields";
import type { ContextSource } from "@/types/context";

const initialState: SourceFormState = { error: null };

export function SourceCardMenu({
  projectId,
  source,
  canDelete,
}: {
  projectId: string;
  source: ContextSource;
  canDelete: boolean;
}) {
  const t = useTranslations("knowledge");
  const [showEdit, setShowEdit] = useState(false);
  // Bumped on every open so <EditSourceForm key={session}> below fully
  // remounts - useActionState's error otherwise survives close/reopen (this
  // component instance persists for the card's whole lifetime in the list),
  // showing a previous failed attempt's error above a freshly reset form.
  const [session, setSession] = useState(0);

  const [deleting, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDelete = () => {
    startDelete(async () => {
      const result = await deleteSource(projectId, source.id);
      setDeleteError(result.error);
    });
  };

  return (
    <>
      <div className="flex flex-col items-end gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" disabled={deleting} aria-label={t("optionsForAria", { title: source.title ?? t("optionsForFallback") })}>
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => {
                setShowEdit(true);
                setSession((s) => s + 1);
              }}
            >
              <Edit className="h-4 w-4 mr-2" />
              {t("edit")}
            </DropdownMenuItem>
            {canDelete && (
              <DropdownMenuItem onClick={handleDelete} className="text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                {t("delete")}
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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">{t("editDialogTitle")}</DialogTitle>
            <DialogDescription>{t("editDialogDescription")}</DialogDescription>
          </DialogHeader>
          <EditSourceForm
            key={session}
            projectId={projectId}
            source={source}
            onClose={() => setShowEdit(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function EditSourceForm({
  projectId,
  source,
  onClose,
}: {
  projectId: string;
  source: ContextSource;
  onClose: () => void;
}) {
  const t = useTranslations("knowledge");
  const updateWithIds = updateSource.bind(null, projectId, source.id);
  const [state, formAction, pending] = useActionState(updateWithIds, initialState);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (submittedRef.current && !pending && state.error === null) {
      onClose();
      submittedRef.current = false;
    }
  }, [pending, state, onClose]);

  return (
    <form
      action={(formData) => {
        submittedRef.current = true;
        formAction(formData);
      }}
      className="space-y-4"
    >
      <SourceFormFields idPrefix={`edit-source-${source.id}`} defaults={source} />
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
        <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={pending}>
          {t("cancel")}
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("saveChanges")}
        </Button>
      </div>
    </form>
  );
}
