"use client";

import { useMemo, useState } from "react";
import { AlertCircle, AlertTriangle, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { attachGuildToProject } from "./actions";

export interface LinkableProject {
  id: string;
  name: string;
  organizationId: string;
  organizationName: string;
  /** Name (or id) of the Discord server the project is already linked to, if any. */
  linkedGuildName: string | null;
}

export function DiscordLinkForm({ token, projects }: { token: string; projects: LinkableProject[] }) {
  const t = useTranslations("discordLink");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The data layer already returns projects ordered by organization then name,
  // so consecutive rows of one organization form a group.
  const groups = useMemo(() => {
    const result: { organizationId: string; organizationName: string; projects: LinkableProject[] }[] = [];
    for (const project of projects) {
      const last = result[result.length - 1];
      if (last && last.organizationId === project.organizationId) {
        last.projects.push(project);
      } else {
        result.push({
          organizationId: project.organizationId,
          organizationName: project.organizationName,
          projects: [project],
        });
      }
    }
    return result;
  }, [projects]);

  const selected = projects.find((project) => project.id === selectedId) ?? null;

  const handleConfirm = async () => {
    if (!selectedId) return;
    setPending(true);
    setError(null);
    try {
      // On success the action redirects (this promise never resolves with a
      // value); it only returns when something went wrong.
      const result = await attachGuildToProject(token, selectedId);
      if (result?.error) setError(result.error);
    } catch {
      setError(t("genericError"));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-4">
        {groups.map((group) => (
          <fieldset key={group.organizationId} className="space-y-2" disabled={pending}>
            <legend className="mb-1 text-sm font-medium text-muted-foreground">
              {group.organizationName || t("unknownOrganization")}
            </legend>
            {group.projects.map((project) => (
              <label
                key={project.id}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-background-secondary ${
                  selectedId === project.id ? "border-primary bg-background-secondary" : "border-border"
                }`}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="project"
                    value={project.id}
                    checked={selectedId === project.id}
                    onChange={() => {
                      setSelectedId(project.id);
                      setError(null);
                    }}
                  />
                  {project.name}
                </span>
                {project.linkedGuildName && (
                  <Badge variant="outline">{t("linkedBadge", { guild: project.linkedGuildName })}</Badge>
                )}
              </label>
            ))}
          </fieldset>
        ))}
      </div>

      {selected?.linkedGuildName && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-md border border-border bg-background-secondary px-3 py-2 text-sm"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          {t("linkedElsewhereWarning", { guild: selected.linkedGuildName })}
        </p>
      )}

      {error && (
        <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      <Button onClick={handleConfirm} disabled={pending || !selected}>
        {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        {t("confirm")}
      </Button>
    </div>
  );
}
