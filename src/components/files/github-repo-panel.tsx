"use client";

import { useEffect, useState, useTransition } from "react";
import { AlertCircle, Code2, Github, Loader2, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GithubFileTree } from "./github-file-tree";
import { CodeEditorModal } from "./code-editor-modal";
import { disconnectRepo } from "@/app/projects/[id]/files/github-actions";
import type { ProjectGithubRepoInfo } from "@/lib/data/github-connection";

interface GithubRepoPanelProps {
  projectId: string;
  repoInfo: ProjectGithubRepoInfo | null;
  canManage: boolean;
  canWrite: boolean;
}

export function GithubRepoPanel({ projectId, repoInfo, canManage, canWrite }: GithubRepoPanelProps) {
  const [openPath, setOpenPath] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Errors from the OAuth connect/callback routes come back as a query param
  // rather than component state, since they land here after a full redirect.
  // Read once via the state initializer (guarded for SSR, where this client
  // component still renders once with no `window`) rather than setting state
  // from inside an effect.
  const [error, setError] = useState<string | null>(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("githubError")
  );

  // Strips the query param from the URL bar - doesn't touch React state, so
  // this doesn't re-trigger anything; it just tidies up after the value was
  // already captured above.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("githubError")) return;
    params.delete("githubError");
    const next = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (next ? `?${next}` : ""));
  }, []);

  const handleDisconnect = () => {
    startTransition(async () => {
      const result = await disconnectRepo(projectId);
      setError(result.error);
    });
  };

  return (
    <>
      {error && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-destructive bg-destructive/10 p-4 text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-muted p-2">
              <Github className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-sm">
                {repoInfo ? (
                  <>
                    Linked to{" "}
                    <span className="font-mono">
                      {repoInfo.repoOwner}/{repoInfo.repoName}
                    </span>
                  </>
                ) : (
                  "No repository connected"
                )}
              </CardTitle>
              <CardDescription className="text-xs">
                {repoInfo
                  ? `Default branch: ${repoInfo.defaultBranch} · connected via @${repoInfo.githubLogin}`
                  : "Connect a GitHub repository to browse and edit its code here."}
              </CardDescription>
            </div>
          </div>

          {canManage && (
            <div className="flex items-center gap-2">
              <Button asChild size="sm" variant={repoInfo ? "outline" : "default"}>
                <a href={`/api/github/connect?projectId=${projectId}`}>
                  <Github className="h-4 w-4 mr-2" />
                  {repoInfo ? "Change repository" : "Connect repository"}
                </a>
              </Button>
              {repoInfo && (
                <Button size="sm" variant="ghost" onClick={handleDisconnect} disabled={pending}>
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
                </Button>
              )}
            </div>
          )}
        </CardHeader>

        {repoInfo && (
          <CardContent>
            <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Code2 className="h-3.5 w-3.5" />
              Click a file to open it in the code editor
            </div>
            <GithubFileTree projectId={projectId} onOpenFile={setOpenPath} />
          </CardContent>
        )}
      </Card>

      {repoInfo && (
        <CodeEditorModal
          projectId={projectId}
          path={openPath}
          defaultBranch={repoInfo.defaultBranch}
          canWrite={canWrite}
          onClose={() => setOpenPath(null)}
        />
      )}
    </>
  );
}
