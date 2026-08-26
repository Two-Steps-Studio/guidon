"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Building2, Lock, Loader2, Search, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { reposForPicker, orgsForPicker, connectRepo } from "../github-actions";
import type { GithubOrgSummary, GithubRepoScope, GithubRepoSummary } from "@/lib/github/client";

export function RepoPicker({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [orgs, setOrgs] = useState<GithubOrgSummary[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(true);
  const [orgsError, setOrgsError] = useState<string | null>(null);
  const [scope, setScope] = useState<GithubRepoScope>({ type: "user" });
  const [search, setSearch] = useState("");
  const [repos, setRepos] = useState<GithubRepoSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connecting, startConnecting] = useTransition();
  const [connectingRepo, setConnectingRepo] = useState<string | null>(null);

  // Orgs load once - which one is selected only changes `scope`, not this list.
  useEffect(() => {
    orgsForPicker(projectId)
      .then((result) => {
        setOrgsError(result.error);
        setOrgs(result.orgs);
      })
      .finally(() => setOrgsLoading(false));
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;

    const timeout = setTimeout(async () => {
      setLoading(true);
      const result = await reposForPicker(projectId, scope, search || undefined);
      if (cancelled) return;
      setRepos(result.repos);
      setError(result.error);
      setLoading(false);
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [projectId, scope, search]);

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

  const scopeKey = (s: GithubRepoScope) => (s.type === "user" ? "user" : `org:${s.org}`);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setScope({ type: "user" })}
          className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm ${
            scope.type === "user"
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          <User className="h-3.5 w-3.5" />
          Your account
        </button>
        {orgs.map((org) => (
          <button
            key={org.login}
            type="button"
            onClick={() => setScope({ type: "org", org: org.login })}
            className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm ${
              scopeKey(scope) === `org:${org.login}`
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            <Building2 className="h-3.5 w-3.5" />
            {org.login}
          </button>
        ))}
        {orgsLoading && (
          <span className="flex items-center gap-1.5 px-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Checking organizations...
          </span>
        )}
        {!orgsLoading && !orgsError && orgs.length === 0 && (
          <span className="px-2 text-xs text-muted-foreground">
            No organizations found for this GitHub account.
          </span>
        )}
      </div>

      {orgsError && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Couldn&apos;t load organizations: {orgsError}
        </div>
      )}

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={scope.type === "user" ? "Search your repositories..." : `Search ${scope.org}'s repositories...`}
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
