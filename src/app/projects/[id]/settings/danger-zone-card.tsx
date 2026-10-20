"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { deleteProject } from "./actions";

/**
 * Deleting the project - last on the settings page, after everything that can
 * be undone. Only rendered for the owner: deleteProject (RLS's
 * projects_delete) is owner-only, unlike every other action on the page.
 */
export function DangerZoneCard({ projectId }: { projectId: string }) {
  const t = useTranslations("settings");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDelete = () => {
    startDelete(async () => {
      const result = await deleteProject(projectId);
      setDeleteError(result.error);
    });
  };

  return (
    <Card className="border-destructive">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" />
          {t("dangerZone")}
        </CardTitle>
        <CardDescription>{t("dangerZoneDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h4 className="font-medium">{t("deleteProjectTitle")}</h4>
            <p className="text-sm text-muted-foreground">
              {t("deleteProjectDescription")}
            </p>
          </div>
          <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <DialogTrigger asChild>
              <Button variant="destructive" type="button">
                <Trash2 className="h-4 w-4 mr-2" />
                {t("deleteProjectButton")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("deleteDialogTitle")}</DialogTitle>
                <DialogDescription>
                  {t("deleteDialogDescription")}
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
                  {t("cancel")}
                </Button>
                <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleting}>
                  {deleting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {t("deleting")}
                    </>
                  ) : (
                    t("deleteProjectButton")
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
}
