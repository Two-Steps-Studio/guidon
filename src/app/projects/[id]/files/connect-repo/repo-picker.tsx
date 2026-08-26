"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Building2, Lock, Loader2, Plus, Search, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { reposForPicker, installationsForPicker, connectRepo } from "../github-actions";
import type { GithubInstallationSummary, GithubRepoSummary } from "@/lib/github/client";

export function RepoPicker({ projectId, installUrl }: { projectId: string; installUrl: string | null }) {
  const router = useRouter();
  const [installations, setInstallations] = useState<GithubInstallationSummary[]>([]);
  const [installationsLoading, setInstallationsLoading] = useState(true);
  const [installationsError, setInstallationsError] = useState<string | null>(null);
  const [selectedInstallation, setSelectedInstallation] = useState<GithubInstallationSummary | null>(null);
  const [search, setSearch] = useState("");
  const [repos, setRepos] = useState<GithubRepoSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connecting, startConnecting] = useTransition();
  const [connectingRepo, setConnectingRepo] = useState<string | null>(null);

  useEffect(() => {
    installationsForPicker(projectId)
      .then((result) => {
        setInstallationsError(result.error);
        setInstallations(result.installations);
        setSelectedInstallation((current) => current ?? result.installations[0] ?? null);
      })
      .finally(() => setInstallationsLoading(false));
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;

    const timeout = setTimeout(async () => {
      if (!selectedInstallation) {
        setRepos([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      const result = await reposForPicker(projectId, selectedInstallation.id, search || undefined);
      if (cancelled) return;
      setRepos(result.repos);
      setError(result.error);
      setLoading(false);
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [projectId, selectedInstallation, search]);

  const handleSelect = (repo: GithubRepoSummary) => {
    if (!selectedInstallation) return;
    setConnectingRepo(repo.fullName);
    startConnecting(async () => {
      const result = await connectRepo(projectId, selectedInstallation.id, repo.owner, repo.name);
      if (result.error) {
        setError(result.error);
        setConnectingRepo(null);
        return;
      }
      router.push(`/projects/${projectId}/files`);
    });
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {installations.map((installation) => (
          <button
            key={installation.id}
            type="button"
            onClick={() => setSelectedInstallation(installation)}
            className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm ${
              selectedInstallation?.id === installation.id
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {installation.accountType === "Organization" ? (
              <Building2 className="h-3.5 w-3.5" />
            ) : (
              <User className="h-3.5 w-3.5" />
            )}
            {installation.accountLogin}
          </button>
        ))}
        {installationsLoading && (
          <span className="flex items-center gap-1.5 px-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Checking accounts...
          </span>
        )}
        {!installationsLoading && !installationsError && installations.length === 0 && (
          <span className="px-2 text-xs text-muted-foreground">
            The GitHub app isn&apos;t installed on any account yet.
          </span>
        )}
        {installUrl && (
          <a
            href={installUrl}
            className="flex items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            Install on another account
          </a>
        )}
      </div>

      {installationsError && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Couldn&apos;t load accounts: {installationsError}
        </div>
      )}

      {selectedInstallation && (
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${selectedInstallation.accountLogin}'s repositories...`}
            className="pl-9"
          />
        </div>
      )}

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <p className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading repositories...
        </p>
      ) : repos.length === 0 && !error ? (
        <p className="p-8 text-center text-sm text-muted-foreground">No repositories found.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {repos.map((repo) => (
            <li key={repo.fullName} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                {repo.private && <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                <span className="truncate text-sm font-medium">{repo.fullName}</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={connecting}
                onClick={() => handleSelect(repo)}
              >
                {connectingRepo === repo.fullName ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Connect"
                )}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
