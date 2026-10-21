"use client";

import { useActionState, useRef, useState, useTransition } from "react";
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
import { AlertCircle, AlertTriangle, FileUp, Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { createProject, type CreateProjectState } from "./actions";
import { importGuidonFile, previewGuidonImport, type GuidonImportPreview } from "@/app/projects/import-actions";
import { type ProjectType, type ProjectMethodology } from "@/types/project";
import { PROJECT_TEMPLATES, type ProjectTemplate } from "@/lib/work/project-modules";
import { Select } from "@/components/ui/select";

const initialState: CreateProjectState = { error: null };

const PROJECT_TYPE_VALUES: ProjectType[] = ["game", "website", "mobile_app", "api", "tool", "other"];
const PROJECT_METHODOLOGY_VALUES: ProjectMethodology[] = ["standard", "scrum"];
const TEMPLATE_VALUES = Object.keys(PROJECT_TEMPLATES) as ProjectTemplate[];

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
  // Blank project, or one created from an exported .guidon file.
  const [source, setSource] = useState<"blank" | "file">("blank");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setSession((s) => s + 1);
          setSource("blank");
        }
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
        <div role="radiogroup" aria-label={t("sourceLabel")} className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1 text-sm">
          {(["blank", "file"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={source === value}
              onClick={() => setSource(value)}
              className={cn(
                "flex items-center justify-center gap-2 rounded px-3 py-1.5 transition-colors",
                source === value ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {value === "blank" ? <Plus className="h-4 w-4" /> : <FileUp className="h-4 w-4" />}
              {t(value === "blank" ? "sourceBlank" : "sourceFile")}
            </button>
          ))}
        </div>
        {source === "blank" ? (
          <ProjectForm key={session} orgId={orgId} onCancel={() => setOpen(false)} />
        ) : (
          <ImportFromFileForm key={session} orgId={orgId} onCancel={() => setOpen(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ProjectForm({ orgId, onCancel }: { orgId: string; onCancel: () => void }) {
  const t = useTranslations("projects.create");
  const tCommon = useTranslations("common");
  const tSettings = useTranslations("settings");
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
        <Select
          id="projectType"
          name="projectType"
          defaultValue=""
        >
          <option value="">{t("notSet")}</option>
          {PROJECT_TYPE_VALUES.map((value) => (
            <option key={value} value={value}>
              {tCommon("projectType", { type: value })}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="projectTemplate">{t("templateLabel")}</Label>
        <Select
          id="projectTemplate"
          name="template"
          defaultValue=""
        >
          <option value="">{t("templateNone")}</option>
          {TEMPLATE_VALUES.map((value) => (
            <option key={value} value={value}>
              {tSettings(`labelStarter.${value}.title`)}
            </option>
          ))}
        </Select>
        <p className="text-xs text-muted-foreground">{t("templateHelp")}</p>
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
      <div className="rounded-md border border-border p-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" name="aiEnabled" defaultChecked className="h-4 w-4" />
          {t("aiEnabledLabel")}
        </label>
        <p className="mt-1 text-xs text-muted-foreground">{t("aiEnabledHelp")}</p>
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

/**
 * Creates the project from a .guidon export (Project settings -> Export):
 * tasks, roadmap and the rest come from the file, through the same
 * validation and import as Projects -> Import, in "new project" mode only -
 * overwriting an existing project stays there, behind its typed confirmation.
 */
function ImportFromFileForm({ orgId, onCancel }: { orgId: string; onCancel: () => void }) {
  const t = useTranslations("projects.create");
  const tImport = useTranslations("projects.import");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [preview, setPreview] = useState<GuidonImportPreview | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [importing, startImport] = useTransition();
  // A slower read of a previously picked file must not overwrite a newer pick.
  const selectionRef = useRef(0);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const selection = ++selectionRef.current;
    setFileName(file.name);
    setFileContent(null);
    setPreview(null);
    setError(null);
    setReading(true);
    const text = await file.text();
    const result = await previewGuidonImport(text);
    if (selection !== selectionRef.current) return;
    setReading(false);
    if (result.preview === null) {
      setError(result.error);
      return;
    }
    setFileContent(text);
    setPreview(result.preview);
    setName(result.preview.projectName);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!fileContent) return;
    setError(null);
    startImport(async () => {
      // Redirects to the new project on success.
      const result = await importGuidonFile({ fileContent, mode: "new", targetId: orgId, projectName: name });
      if (result.error) setError(result.error);
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        accept=".guidon,application/json"
        className="hidden"
        onChange={(event) => onFile(event.target.files?.[0])}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          onFile(event.dataTransfer.files?.[0]);
        }}
        className="flex w-full flex-col items-center gap-1 rounded-md border border-dashed border-border px-4 py-6 text-sm transition-colors hover:border-primary hover:bg-accent/40"
      >
        <FileUp className="h-5 w-5 text-muted-foreground" />
        <span className="font-medium">{fileName ?? tImport("chooseFile")}</span>
        <span className="text-xs text-muted-foreground">{t("fileHelp")}</span>
      </button>

      {reading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {tImport("readingFile")}
        </p>
      )}

      {preview && (
        <>
          <div className="space-y-2 rounded-md border border-border p-3 text-sm">
            <p className="text-muted-foreground">
              {tImport("taskCount", { count: preview.taskCount })}, {tImport("phaseCount", { count: preview.phaseCount })}
            </p>
            {preview.warnings.map((warning) => (
              <p key={warning} className="flex items-start gap-2 text-xs text-warning">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {warning}
              </p>
            ))}
          </div>
          <div className="space-y-2">
            <Label htmlFor="importProjectName">{t("nameLabel")}</Label>
            <Input id="importProjectName" value={name} onChange={(event) => setName(event.target.value)} required />
          </div>
        </>
      )}

      {error && (
        <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={importing}>
          {t("cancel")}
        </Button>
        <Button type="submit" disabled={!preview || !name.trim() || importing}>
          {importing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t("creating")}
            </>
          ) : (
            t("createFromFile")
          )}
        </Button>
      </div>
    </form>
  );
}
