"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, GitPullRequest, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { monacoLanguage } from "@/types/file";
import { commitRepoFile, getRepoFile } from "@/app/projects/[id]/files/github-actions";

const CodeEditor = dynamic(() => import("./code-editor"), {
  ssr: false,
  loading: () => (
    <p className="flex items-center gap-2 p-16 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      Loading editor...
    </p>
  ),
});

interface CodeEditorModalProps {
  projectId: string;
  path: string | null;
  defaultBranch: string;
  canWrite: boolean;
  onClose: () => void;
}

export function CodeEditorModal({ projectId, path, defaultBranch, canWrite, onClose }: CodeEditorModalProps) {
  if (!path) return null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-hidden p-0 sm:max-w-4xl">
        {/* Keyed so opening another file remounts with fresh state (content,
            branch, commit message, ...) instead of reset via effect - same
            trick FileViewer/FilePreview uses for its signed-URL fetch. */}
        <EditorBody
          key={path}
          projectId={projectId}
          path={path}
          defaultBranch={defaultBranch}
          canWrite={canWrite}
        />
      </DialogContent>
    </Dialog>
  );
}

type CommitMode = "direct" | "pr";

function suggestedBranchName(path: string): string {
  return `guidon/${path.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "update"}`;
}

function EditorBody({
  projectId,
  path,
  defaultBranch,
  canWrite,
}: {
  projectId: string;
  path: string;
  defaultBranch: string;
  canWrite: boolean;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [sha, setSha] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const [branch, setBranch] = useState(defaultBranch);
  const [mode, setMode] = useState<CommitMode>("direct");
  const [newBranchName, setNewBranchName] = useState(() => suggestedBranchName(path));
  const [message, setMessage] = useState(() => `Update ${path}`);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ commitUrl: string | null; pullRequestUrl: string | null } | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const result = await getRepoFile(projectId, path);
      if (cancelled) return;

      if (result.error || result.content === null) {
        setLoadError(result.error ?? "Could not load this file.");
        return;
      }

      setContent(result.content);
      setSha(result.sha);
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, path]);

  const handleSave = async () => {
    if (content === null || !sha) return;

    setSaving(true);
    setSaveError(null);

    const result = await commitRepoFile(projectId, path, content, sha, {
      branch,
      message,
      mode,
      newBranchName: mode === "pr" ? newBranchName : undefined,
    });

    setSaving(false);

    if (result.error) {
      setSaveError(result.error);
      return;
    }

    if (result.sha) setSha(result.sha);
    setDirty(false);
    setSuccess({ commitUrl: result.commitUrl, pullRequestUrl: result.pullRequestUrl });
  };

  return (
    <>
      <DialogHeader className="border-b border-border px-4 py-3">
        <DialogTitle className="truncate pr-8 text-sm font-medium">{path}</DialogTitle>
        <DialogDescription className="text-xs">
          {canWrite ? "Editing from GitHub" : "Read-only - viewing from GitHub"}
        </DialogDescription>
      </DialogHeader>

      <div className="min-h-64 overflow-auto bg-background-secondary">
        {loadError ? (
          <div role="alert" className="flex items-center justify-center gap-2 p-16 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {loadError}
          </div>
        ) : content === null ? (
          <p className="flex items-center justify-center gap-2 p-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading file...
          </p>
        ) : (
          <CodeEditor
            value={content}
            language={monacoLanguage(path)}
            readOnly={!canWrite}
            onChange={(next) => {
              setContent(next);
              setDirty(true);
              setSuccess(null);
            }}
          />
        )}
      </div>

      {canWrite && content !== null && !loadError && (
        <DialogFooter className="flex-col items-stretch gap-3 border-t border-border px-4 py-3 sm:flex-col sm:items-stretch">
          {success && (
            <p className="flex items-center gap-2 text-xs text-success">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {success.pullRequestUrl ? (
                <>
                  Pull request opened —{" "}
                  <a href={success.pullRequestUrl} target="_blank" rel="noreferrer" className="underline">
                    view on GitHub
                  </a>
                </>
              ) : (
                <>
                  Committed —{" "}
                  {success.commitUrl ? (
                    <a href={success.commitUrl} target="_blank" rel="noreferrer" className="underline">
                      view on GitHub
                    </a>
                  ) : (
                    "changes saved."
                  )}
                </>
              )}
            </p>
          )}

          {saveError && (
            <p role="alert" className="flex items-center gap-2 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5" />
              {saveError}
            </p>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="commit-branch" className="text-xs">
                {mode === "direct" ? "Branch" : "Base branch"}
              </Label>
              <Input
                id="commit-branch"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="commit-message" className="text-xs">
                Commit message
              </Label>
              <Input
                id="commit-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => setMode("direct")}
                className={`rounded-md border px-2 py-1 ${
                  mode === "direct" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                }`}
              >
                Commit directly
              </button>
              <button
                type="button"
                onClick={() => setMode("pr")}
                className={`flex items-center gap-1 rounded-md border px-2 py-1 ${
                  mode === "pr" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                }`}
              >
                <GitPullRequest className="h-3 w-3" />
                New branch + PR
              </button>
            </div>

            {mode === "pr" && (
              <Input
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                placeholder="new-branch-name"
                className="h-8 max-w-56 text-xs"
              />
            )}

            <Button size="sm" className="ml-auto" onClick={handleSave} disabled={saving || !dirty}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {mode === "pr" ? "Commit & open PR" : "Commit"}
            </Button>
          </div>
        </DialogFooter>
      )}
    </>
  );
}
