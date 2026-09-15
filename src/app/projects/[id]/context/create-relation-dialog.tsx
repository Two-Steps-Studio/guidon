"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
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
import { ENTITY_TYPE_OPTIONS, RELATION_TYPE_OPTIONS } from "./relation-config";

const initialState: RelationFormState = { error: null };

export function CreateRelationDialog({ projectId }: { projectId: string }) {
  const t = useTranslations("context");
  const [open, setOpen] = useState(false);
  // Bumped on every open so <RelationForm key={session}> below fully
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
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          {t("newRelation")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("createRelationDialogTitle")}</DialogTitle>
          <DialogDescription>{t("createRelationDialogDescription")}</DialogDescription>
        </DialogHeader>
        <RelationForm key={session} projectId={projectId} onClose={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function RelationForm({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const t = useTranslations("context");
  const tCommon = useTranslations("common");
  const createWithProject = createRelation.bind(null, projectId);
  const [state, formAction, pending] = useActionState(createWithProject, initialState);
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
      <div className="space-y-2">
        <Label htmlFor="sourceType">{t("sourceTypeLabel")}</Label>
        <select
          id="sourceType"
          name="source_type"
          defaultValue="decision"
          className="w-full px-3 py-2 border rounded-md bg-background"
        >
          {ENTITY_TYPE_OPTIONS.map((type) => (
            <option key={type} value={type}>
              {tCommon("entityType", { type })}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="sourceId">{t("sourceIdLabel")}</Label>
        <Input id="sourceId" name="source_id" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="targetType">{t("targetTypeLabel")}</Label>
        <select
          id="targetType"
          name="target_type"
          defaultValue="task"
          className="w-full px-3 py-2 border rounded-md bg-background"
        >
          {ENTITY_TYPE_OPTIONS.map((type) => (
            <option key={type} value={type}>
              {tCommon("entityType", { type })}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="targetId">{t("targetIdLabel")}</Label>
        <Input id="targetId" name="target_id" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="relationType">{t("relationTypeLabel")}</Label>
        <select
          id="relationType"
          name="relation_type"
          defaultValue="depends_on"
          className="w-full px-3 py-2 border rounded-md bg-background"
        >
          {RELATION_TYPE_OPTIONS.map((type) => (
            <option key={type} value={type}>
              {tCommon("relationType", { type })}
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
        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
          {t("cancel")}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {t("creating")}
            </>
          ) : (
            t("createRelation")
          )}
        </Button>
      </div>
    </form>
  );
}
