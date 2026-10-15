"use client";

import { useState } from "react";
import { AlertCircle, AlertTriangle, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { SlackLinkableProject } from "@/lib/data/slack-integration";
import { attachSlackChannelToProject } from "./actions";

export function SlackLinkForm({ token, projects }: { token: string; projects: SlackLinkableProject[] }) {
  const t = useTranslations("slackLink");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (!selectedId) return;
    setPending(true);
    setError(null);
    try {
      // Redirects on success; only returns when something went wrong.
      const result = await attachSlackChannelToProject(token, selectedId);
      if (result?.error) setError(result.error);
    } catch {
      setError(t("genericError"));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-5">
      <fieldset className="space-y-2" disabled={pending}>
        <legend className="sr-only">{t("pickProject")}</legend>
        {projects.map((project, index) => {
          // Projects come sorted by organization: a new group starts where the name changes.
          const header = index === 0 || projects[index - 1].organizationName !== project.organizationName;
          return (
            <div key={project.id}>
              {header && (
                <p className="mb-1 mt-3 text-sm font-medium text-muted-foreground first:mt-0">
                  {project.organizationName || t("unknownOrganization")}
                </p>
              )}
              <label className="flex cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                <input
                  type="radio"
                  name="project"
                  value={project.id}
                  checked={selectedId === project.id}
                  onChange={() => setSelectedId(project.id)}
                />
                {project.name}
              </label>
            </div>
          );
        })}
      </fieldset>

      <p className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        {t("phishingWarning")}
      </p>

      {error && (
        <p className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      <Button onClick={confirm} disabled={!selectedId || pending}>
        {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {t("confirm")}
      </Button>
    </div>
  );
}
