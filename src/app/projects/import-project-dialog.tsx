"use client";

import { useRef, useState, useTransition } from "react";
import { AlertCircle, AlertTriangle, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { importGuidonFile, previewGuidonImport, type GuidonImportPreview } from "./import-actions";

interface ImportProjectDialogProps {
  organizations: { id: string; name: string }[];
  projects: { id: string; name: string }[];
}

type ImportMode = "new" | "overwrite";

export function ImportProjectDialog({ organizations, projects }: ImportProjectDialogProps) {
  const [open, setOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<GuidonImportPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const [mode, setMode] = useState<ImportMode>("new");
  const [orgId, setOrgId] = useState(organizations[0]?.id ?? "");
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");

  const [importing, startImport] = useTransition();
  const [importError, setImportError] = useState<string | null>(null);

  const reset = () => {
    setFileContent(null);
    setFileName(null);
    setPreview(null);
    setPreviewError(null);
    setImportError(null);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    reset();
    setFileName(file.name);
    setLoadingPreview(true);

    const text = await file.text();
    setFileContent(text);

    const result = await previewGuidonImport(text);
    setLoadingPreview(false);

    if (result.error) {
      setPreviewError(result.error);
      return;
    }
    setPreview(result.preview);
  };

  const handleImport = () => {
    if (!fileContent) return;
    const targetId = mode === "new" ? orgId : projectId;
    if (!targetId) {
      setImportError(mode === "new" ? "Choose an organization." : "Choose a project to overwrite.");
      return;
    }

    setImportError(null);
    startImport(async () => {
      const result = await importGuidonFile({ fileContent, mode, targetId });
      if (result.error) setImportError(result.error);
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          reset();
          if (fileInputRef.current) fileInputRef.current.value = "";
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="h-4 w-4 mr-2" />
          Import Project
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import project</DialogTitle>
          <DialogDescription>Import a .guidon file as a new project, or to overwrite an existing one.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".guidon,application/json"
              onChange={handleFileChange}
              className="hidden"
            />
            <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
              {fileName ?? "Choose .guidon file..."}
            </Button>
          </div>

          {loadingPreview && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Reading file...
            </p>
          )}

          {previewError && (
            <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {previewError}
            </p>
          )}

          {preview && (
            <div className="space-y-3 rounded-md border border-border p-3 text-sm">
              <p>
                <span className="font-medium">{preview.projectName}</span>
                {preview.projectDescription && (
                  <span className="text-muted-foreground"> — {preview.projectDescription}</span>
                )}
              </p>
              <p className="text-muted-foreground">
                {preview.taskCount} task{preview.taskCount === 1 ? "" : "s"}, {preview.phaseCount} roadmap phase
                {preview.phaseCount === 1 ? "" : "s"}
              </p>
              {preview.warnings.map((warning) => (
                <p key={warning} className="flex items-start gap-2 text-xs text-warning">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  {warning}
                </p>
              ))}

              <div className="space-y-2 border-t border-border pt-3">
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setMode("new")}
                    className={`rounded-md border px-2 py-1 ${
                      mode === "new" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                    }`}
                  >
                    Create new project
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("overwrite")}
                    className={`rounded-md border px-2 py-1 ${
                      mode === "overwrite"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    Overwrite existing project
                  </button>
                </div>

                {mode === "new" ? (
                  <div className="space-y-1">
                    <Label htmlFor="import-org" className="text-xs">
                      Organization
                    </Label>
                    <select
                      id="import-org"
                      value={orgId}
                      onChange={(e) => setOrgId(e.target.value)}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    >
                      {organizations.map((org) => (
                        <option key={org.id} value={org.id}>
                          {org.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Label htmlFor="import-project" className="text-xs">
                      Project to overwrite
                    </Label>
                    <select
                      id="import-project"
                      value={projectId}
                      onChange={(e) => setProjectId(e.target.value)}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    >
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                    <p className="flex items-start gap-2 text-xs text-destructive">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      This permanently replaces the target project&apos;s tasks and roadmap phases with what&apos;s
                      in this file.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {importError && (
            <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {importError}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={importing}>
            Cancel
          </Button>
          <Button type="button" onClick={handleImport} disabled={!preview || importing}>
            {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
