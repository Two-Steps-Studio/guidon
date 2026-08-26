"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Lock, Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { reposForPicker, connectRepo } from "../github-actions";
import type { GithubRepoSummary } from "@/lib/github/client";

export function RepoPicker({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [repos, setRepos] = useState<GithubRepoSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connecting, startConnecting] = useTransition();
  const [connectingRepo, setConnectingRepo] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const timeout = setTimeout(async () => {
      setLoading(true);
      const result = await reposForPicker(projectId, search || undefined);
      if (cancelled) return;
      setRepos(result.repos);
      setError(result.error);
      setLoading(false);
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [projectId, search]);

  const handleSelect = (repo: GithubRepoSummary) => {
    setConnectingRepo(repo.fullName);
    startConnecting(async () => {
      const result = await connectRepo(projectId, repo.owner, repo.name);
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
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search your repositories..."
          className="pl-9"
        />
      </div>

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
