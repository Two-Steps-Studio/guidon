"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  GitPullRequest,
  Loader2,
  Maximize2,
  Minimize2,
  Pencil,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSidebar } from "@/components/ui/sidebar";
import { GithubFileTree, fileIconFor } from "./github-file-tree";
import { MarkdownPreview } from "./markdown-preview";
import { detectFileKind, fileExtension, monacoLanguage } from "@/types/file";
import { commitRepoFile, getRepoFile } from "@/app/projects/[id]/files/github-actions";

const CodeEditor = dynamic(() => import("./code-editor"), {
  ssr: false,
  loading: () => (
    <p className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      Loading editor...
    </p>
  ),
});

type CommitMode = "direct" | "pr";
type TabKind = "text" | "image" | "markdown";

interface OpenTab {
  path: string;
  kind: TabKind;
  content: string | null;
  sha: string | null;
  loadError: string | null;
  dirty: boolean;
  mdPreview: boolean;
  branch: string;
  mode: CommitMode;
  newBranchName: string;
  message: string;
  saving: boolean;
  saveError: string | null;
  success: { commitUrl: string | null; pullRequestUrl: string | null } | null;
}

const IMAGE_MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  ico: "image/x-icon",
  avif: "image/avif",
};

function tabKindFor(path: string): TabKind {
  if (detectFileKind({ name: path }) === "image") return "image";
  const ext = fileExtension(path);
  if (ext === "md" || ext === "markdown") return "markdown";
  return "text";
}

function suggestedBranchName(path: string): string {
  return `guidon/${path.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "update"}`;
}

function createTab(path: string, defaultBranch: string): OpenTab {
  const kind = tabKindFor(path);
  return {
    path,
    kind,
    content: null,
    sha: null,
    loadError: null,
    dirty: false,
    mdPreview: kind === "markdown",
    branch: defaultBranch,
    mode: "direct",
    newBranchName: suggestedBranchName(path),
    message: `Update ${path}`,
    saving: false,
    saveError: null,
    success: null,
  };
}

interface CodeWorkspaceProps {
  projectId: string;
  defaultBranch: string;
  canWrite: boolean;
}

/**
 * Persistent, multi-tab code workspace - sidebar file tree always visible,
 * several files open at once, each keeping its own unsaved edits when you
 * switch tabs. Replaces the old one-file-at-a-time modal (code-editor-modal.tsx).
 */
export function CodeWorkspace({ projectId, defaultBranch, canWrite }: CodeWorkspaceProps) {
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [maximized, setMaximized] = useState(false);
  const { state: sidebarState, isMobile } = useSidebar();

  const activeTab = tabs.find((tab) => tab.path === activePath) ?? null;

  const updateTab = (path: string, patch: Partial<OpenTab>) => {
    setTabs((prev) => prev.map((tab) => (tab.path === path ? { ...tab, ...patch } : tab)));
  };

  const openFile = (path: string) => {
    setActivePath(path);
    if (tabs.some((tab) => tab.path === path)) return;

    setTabs((prev) => [...prev, createTab(path, defaultBranch)]);

    getRepoFile(projectId, path).then((result) => {
      if (result.error || result.content === null) {
        updateTab(path, { loadError: result.error ?? "Could not load this file." });
        return;
      }
      updateTab(path, { content: result.content, sha: result.sha });
    });
  };

  const closeTab = (path: string) => {
    const tab = tabs.find((t) => t.path === path);
    if (tab?.dirty && !window.confirm(`Discard unsaved changes to ${path}?`)) return;

    const remaining = tabs.filter((t) => t.path !== path);
    setTabs(remaining);
    if (activePath === path) {
      setActivePath(remaining.length > 0 ? remaining[remaining.length - 1].path : null);
    }
  };

  const handleSave = async () => {
    if (!activeTab || activeTab.content === null || !activeTab.sha) return;
    const { path, content, sha, branch, message, mode, newBranchName } = activeTab;

    updateTab(path, { saving: true, saveError: null });

    const result = await commitRepoFile(projectId, path, content, sha, {
      branch,
      message,
      mode,
      newBranchName: mode === "pr" ? newBranchName : undefined,
    });

    if (result.error) {
      updateTab(path, { saving: false, saveError: result.error });
      return;
    }

    updateTab(path, {
      saving: false,
      saveError: null,
      sha: result.sha ?? sha,
      dirty: false,
      success: { commitUrl: result.commitUrl, pullRequestUrl: result.pullRequestUrl },
    });
  };

  // Maximize keeps the app's own nav sidebar visible (and the 48px header,
  // which holds the sidebar's own collapse toggle) - only the workspace
  // grows to fill everything else. On mobile the sidebar is an off-canvas
  // sheet, not a docked column, so there's no width to leave room for.
  const maximizedLeftOffset = isMobile ? "0px" : sidebarState === "collapsed" ? "3rem" : "16rem";

  return (
    <div
      className={
        maximized
          ? "fixed top-12 right-0 bottom-0 z-30 flex overflow-hidden border-t border-border bg-background"
          : "flex h-[70vh] min-h-[420px] overflow-hidden rounded-lg border border-border"
      }
      style={maximized ? { left: maximizedLeftOffset } : undefined}
    >
      <div className="w-64 shrink-0 border-r border-border bg-background-secondary">
        <GithubFileTree projectId={projectId} activePath={activePath} onOpenFile={openFile} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center border-b border-border">
          <div className="flex flex-1 overflow-x-auto">
            {tabs.map((tab) => {
              const { icon: TabIcon, colorClass } = fileIconFor(tab.path);
              const isActive = tab.path === activePath;
              return (
                <button
                  key={tab.path}
                  type="button"
                  onClick={() => setActivePath(tab.path)}
                  className={`flex shrink-0 items-center gap-1.5 border-r border-border px-3 py-2 text-xs ${
                    isActive
                      ? "bg-background text-foreground"
                      : "bg-background-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <TabIcon className={`h-3.5 w-3.5 shrink-0 ${colorClass}`} />
                  <span className="max-w-40 truncate">{tab.path.split("/").pop()}</span>
                  {tab.dirty ? (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-foreground" />
                  ) : (
                    <X
                      className="h-3.5 w-3.5 shrink-0 text-muted-foreground hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTab(tab.path);
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setMaximized((prev) => !prev)}
            title={maximized ? "Exit full screen" : "Full screen"}
            className="flex shrink-0 items-center px-3 py-2 text-muted-foreground hover:text-foreground"
          >
            {maximized ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        </div>

        {!activeTab ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Select a file to start editing
          </div>
        ) : (
          <>
            {activeTab.kind === "markdown" && (
              <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5">
                <button
                  type="button"
                  onClick={() => updateTab(activeTab.path, { mdPreview: true })}
                  className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs ${
                    activeTab.mdPreview ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Eye className="h-3 w-3" />
                  Preview
                </button>
                <button
                  type="button"
                  onClick={() => updateTab(activeTab.path, { mdPreview: false })}
                  className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs ${
                    !activeTab.mdPreview ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Pencil className="h-3 w-3" />
                  Edit
                </button>
              </div>
            )}

            <div className="min-h-0 flex-1">
              {activeTab.loadError ? (
                <div role="alert" className="flex h-full items-center justify-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  {activeTab.loadError}
                </div>
              ) : activeTab.content === null ? (
                <p className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading file...
                </p>
              ) : activeTab.kind === "image" ? (
                <div className="flex h-full items-center justify-center overflow-auto bg-background-secondary p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element -- base64 data: URL from the GitHub API, not a next/image candidate */}
                  <img
                    src={`data:${IMAGE_MIME_TYPES[fileExtension(activeTab.path)] ?? "application/octet-stream"};base64,${activeTab.content}`}
                    alt={activeTab.path}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              ) : activeTab.kind === "markdown" && activeTab.mdPreview ? (
                <MarkdownPreview content={activeTab.content} />
              ) : (
                <CodeEditor
                  value={activeTab.content}
                  language={monacoLanguage(activeTab.path)}
                  readOnly={!canWrite}
                  onChange={(next) => updateTab(activeTab.path, { content: next, dirty: true, success: null })}
                />
              )}
            </div>

            {canWrite &&
              activeTab.kind !== "image" &&
              !(activeTab.kind === "markdown" && activeTab.mdPreview) &&
              activeTab.content !== null &&
              !activeTab.loadError && (
                <div className="flex shrink-0 flex-col gap-3 border-t border-border px-4 py-3">
                  {activeTab.success && (
                    <p className="flex items-center gap-2 text-xs text-success">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {activeTab.success.pullRequestUrl ? (
                        <>
                          Pull request opened —{" "}
                          <a href={activeTab.success.pullRequestUrl} target="_blank" rel="noreferrer" className="underline">
                            view on GitHub
                          </a>
                        </>
                      ) : (
                        <>
                          Committed —{" "}
                          {activeTab.success.commitUrl ? (
                            <a href={activeTab.success.commitUrl} target="_blank" rel="noreferrer" className="underline">
                              view on GitHub
                            </a>
                          ) : (
                            "changes saved."
                          )}
                        </>
                      )}
                    </p>
                  )}

                  {activeTab.saveError && (
                    <p role="alert" className="flex items-center gap-2 text-xs text-destructive">
                      <AlertCircle className="h-3.5 w-3.5" />
                      {activeTab.saveError}
                    </p>
                  )}

                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="commit-branch" className="text-xs">
                        {activeTab.mode === "direct" ? "Branch" : "Base branch"}
                      </Label>
                      <Input
                        id="commit-branch"
                        value={activeTab.branch}
                        onChange={(e) => updateTab(activeTab.path, { branch: e.target.value })}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="commit-message" className="text-xs">
                        Commit message
                      </Label>
                      <Input
                        id="commit-message"
                        value={activeTab.message}
                        onChange={(e) => updateTab(activeTab.path, { message: e.target.value })}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => updateTab(activeTab.path, { mode: "direct" })}
                        className={`rounded-md border px-2 py-1 ${
                          activeTab.mode === "direct"
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground"
                        }`}
                      >
                        Commit directly
                      </button>
                      <button
                        type="button"
                        onClick={() => updateTab(activeTab.path, { mode: "pr" })}
                        className={`flex items-center gap-1 rounded-md border px-2 py-1 ${
                          activeTab.mode === "pr"
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground"
                        }`}
                      >
                        <GitPullRequest className="h-3 w-3" />
                        New branch + PR
                      </button>
                    </div>

                    {activeTab.mode === "pr" && (
                      <Input
                        value={activeTab.newBranchName}
                        onChange={(e) => updateTab(activeTab.path, { newBranchName: e.target.value })}
                        placeholder="new-branch-name"
                        className="h-8 max-w-56 text-xs"
                      />
                    )}

                    <Button
                      size="sm"
                      className="ml-auto"
                      onClick={handleSave}
                      disabled={activeTab.saving || !activeTab.dirty}
                    >
                      {activeTab.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {activeTab.mode === "pr" ? "Commit & open PR" : "Commit"}
                    </Button>
                  </div>
                </div>
              )}
          </>
        )}
      </div>
    </div>
  );
}
