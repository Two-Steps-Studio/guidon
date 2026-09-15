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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, Loader2, Plus } from "lucide-react";
import { createMemory, type MemoryFormState } from "./actions";
import { MEMORY_TYPES } from "./memory-type-config";

const initialState: MemoryFormState = { error: null };

export function CreateMemoryDialog({ projectId, trigger }: { projectId: string; trigger?: React.ReactNode }) {
  const t = useTranslations("memory");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const createWithProject = createMemory.bind(null, projectId);
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
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            {t("newMemory")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("dialogTitle")}</DialogTitle>
          <DialogDescription>{t("dialogDescription")}</DialogDescription>
        </DialogHeader>
        <form
          action={(formData) => {
            submittedRef.current = true;
            formAction(formData);
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="memoryContent">{t("contentLabel")}</Label>
            <Textarea id="memoryContent" name="content" rows={4} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="memoryType">{t("typeLabel")}</Label>
            <select
              id="memoryType"
              name="memory_type"
              defaultValue="fact"
              className="w-full px-3 py-2 border rounded-md bg-background"
            >
              {MEMORY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {tCommon("memoryType", { type })}
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
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t("creating")}
                </>
              ) : (
                t("createMemory")
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
