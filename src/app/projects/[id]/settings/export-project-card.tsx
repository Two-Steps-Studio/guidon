"use client";

import { useState } from "react";
import { AlertCircle, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { exportProject } from "./export-actions";

export function ExportProjectCard({ projectId }: { projectId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setPending(true);
    setError(null);

    const result = await exportProject(projectId);
    setPending(false);

    if (result.error || !result.contents || !result.filename) {
      setError(result.error ?? "Export failed.");
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
          Export project
        </CardTitle>
        <CardDescription>
          Download this project&apos;s theme, task board, and roadmap as a <code>.guidon</code> file. Re-import
          it later as a new project or to overwrite an existing one, from the Projects page.
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
          Export to .guidon file
        </Button>
      </CardContent>
    </Card>
  );
}
