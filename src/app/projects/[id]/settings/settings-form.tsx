"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, AlertTriangle, Loader2, Settings, Trash2, X } from "lucide-react";
import { deleteProject, updateProjectSettings, type SettingsFormState } from "./actions";
import type { Project, ProjectStatus } from "@/types/project";

const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
  { value: "deleted", label: "Deleted" },
];

const initialState: SettingsFormState = { error: null };

export function SettingsForm({
  project,
  initialTechnologies,
}: {
  project: Project;
  initialTechnologies: string[];
}) {
  const updateWithId = updateProjectSettings.bind(null, project.id);
  const [state, formAction, saving] = useActionState(updateWithId, initialState);
  const [technologies, setTechnologies] = useState<string[]>(initialTechnologies);

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleTechnologyAdd = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && e.currentTarget.value.trim()) {
      e.preventDefault();
      const tech = e.currentTarget.value.trim();
      if (!technologies.includes(tech)) {
        setTechnologies([...technologies, tech]);
      }
      e.currentTarget.value = "";
    }
  };

  const handleTechnologyRemove = (tech: string) => {
    setTechnologies(technologies.filter((t) => t !== tech));
  };

  const handleDelete = () => {
    startDelete(async () => {
      const result = await deleteProject(project.id);
      setDeleteError(result.error);
    });
  };

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="technologies" value={JSON.stringify(technologies)} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            General
          </CardTitle>
          <CardDescription>Basic project information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Project Name</Label>
            <Input id="name" name="name" defaultValue={project.name} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" name="description" defaultValue={project.description ?? ""} rows={4} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <select
              id="status"
              name="status"
              defaultValue={project.status}
              className="w-full px-3 py-2 border rounded-md bg-background"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="technologiesInput">Technologies (press Enter to add)</Label>
            <Input id="technologiesInput" onKeyDown={handleTechnologyAdd} placeholder="Add technology..." />
            {technologies.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {technologies.map((tech) => (
                  <Badge key={tech} variant="secondary" className="flex items-center gap-1">
                    {tech}
                    <button
                      type="button"
                      onClick={() => handleTechnologyRemove(tech)}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Danger Zone
          </CardTitle>
          <CardDescription>Irreversible and destructive actions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium">Delete this project</h4>
              <p className="text-sm text-muted-foreground">
                Once deleted, all project data will be permanently removed.
              </p>
            </div>
            <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
              <DialogTrigger asChild>
                <Button variant="destructive" type="button">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Project
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete Project</DialogTitle>
                  <DialogDescription>
                    This action cannot be undone. This will permanently delete the project and
                    all associated data including tasks, files, decisions, and memory.
                  </DialogDescription>
                </DialogHeader>
                {deleteError && (
                  <div className="text-sm text-destructive flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    {deleteError}
                  </div>
                )}
                <div className="flex justify-end gap-2 mt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowDeleteDialog(false)}
                    disabled={deleting}
                  >
                    Cancel
                  </Button>
                  <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleting}>
                    {deleting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      "Delete Project"
                    )}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>

      {state.error && (
        <div className="p-4 bg-destructive/10 border border-destructive rounded-lg flex items-center gap-2 text-destructive">
          <AlertCircle className="h-4 w-4" />
          {state.error}
        </div>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={saving}>
          {saving ? (
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
