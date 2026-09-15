"use client";

import { useActionState, useState } from "react";
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
import { createProject, type CreateProjectState } from "./actions";
import { type ProjectType, type ProjectMethodology } from "@/types/project";

const initialState: CreateProjectState = { error: null };

const PROJECT_TYPE_VALUES: ProjectType[] = ["game", "website", "mobile_app", "api", "tool", "other"];
const PROJECT_METHODOLOGY_VALUES: ProjectMethodology[] = ["standard", "scrum"];

export function CreateProjectDialog({
  orgId,
  orgName,
  trigger,
}: {
  orgId: string;
  orgName: string;
  trigger?: React.ReactNode;
}) {
  const t = useTranslations("projects.create");
  const [open, setOpen] = useState(false);
  // Bumped on every open so <ProjectForm key={session}> below fully remounts
  // - useActionState's state otherwise survives close/reopen indefinitely
  // (this component itself never unmounts, only DialogContent's children
  // do), so a previous failed submission's error text would still be
  // showing above a freshly emptied form the next time the dialog opened.
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
            {t("trigger")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("dialogTitle")}</DialogTitle>
          <DialogDescription>{t("dialogDescription", { orgName })}</DialogDescription>
        </DialogHeader>
        <ProjectForm key={session} orgId={orgId} onCancel={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ProjectForm({ orgId, onCancel }: { orgId: string; onCancel: () => void }) {
  const t = useTranslations("projects.create");
  const tCommon = useTranslations("common");
  const createProjectWithOrg = createProject.bind(null, orgId);
  const [state, formAction, pending] = useActionState(createProjectWithOrg, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="projectName">{t("nameLabel")}</Label>
        <Input id="projectName" name="name" placeholder={t("namePlaceholder")} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="projectDescription">{t("descriptionLabel")}</Label>
        <Input
          id="projectDescription"
          name="description"
          placeholder={t("descriptionPlaceholder")}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="projectType">{t("projectTypeLabel")}</Label>
        <select
          id="projectType"
          name="projectType"
          defaultValue=""
          className="w-full px-3 py-2 border rounded-md bg-background"
        >
          <option value="">{t("notSet")}</option>
          {PROJECT_TYPE_VALUES.map((value) => (
            <option key={value} value={value}>
              {tCommon("projectType", { type: value })}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label>{t("workflowLabel")}</Label>
        <div className="flex gap-4">
          {PROJECT_METHODOLOGY_VALUES.map((value) => (
            <label key={value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="methodology"
                value={value}
                defaultChecked={value === "standard"}
              />
              {tCommon("projectMethodology", { methodology: value })}
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {t("workflowHelp")}
        </p>
      </div>
      {state.error && (
        <div className="text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          {state.error}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          {t("cancel")}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {t("creating")}
            </>
          ) : (
            t("createButton")
          )}
        </Button>
      </div>
    </form>
  );
}
