"use client";

import { useState } from "react";
import { AlertCircle, Download, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { exportProject } from "./export-actions";

export function ExportProjectCard({ projectId }: { projectId: string }) {
  const t = useTranslations("settings");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setPending(true);
    setError(null);

    const result = await exportProject(projectId);
    setPending(false);

    if (result.error || !result.contents || !result.filename) {
      setError(result.error ?? t("exportFailed"));
      return;
    }

    // Same download-a-generated-blob pattern as file-viewer.tsx's DownloadButton.
    const blob = new Blob([result.contents], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = result.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(href);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="h-5 w-5" />
          {t("exportProjectTitle")}
        </CardTitle>
        <CardDescription>
          {t("exportProjectDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <p className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </p>
        )}
        <Button onClick={handleExport} disabled={pending} variant="outline">
          {pending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Download className="h-4 w-4 mr-2" />
          )}
          {t("exportButton")}
        </Button>
      </CardContent>
    </Card>
  );
}
