"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateOrganizationProjectLimit } from "./actions";
import { ORG_PROJECT_LIMIT_UNLIMITED_SENTINEL } from "./constants";

export function ProjectLimitEditor({
  orgId,
  initialLimit,
}: {
  orgId: string;
  initialLimit: number;
}) {
  const [value, setValue] = useState(String(initialLimit));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Adjusted during render rather than in an effect (React's own recommended
  // pattern - see the matching comment in ai-settings-form.tsx) - syncs the
  // displayed value when a sibling PlanEditor on the same row changes the
  // org's plan, which also rewrites this org's project_limit server-side and
  // calls revalidatePath("/admin/organizations"). Without this, the input
  // kept showing the pre-change limit until a manual reload, since this
  // component itself never unmounts on a Server Component re-render.
  const [reactedTo, setReactedTo] = useState(initialLimit);
  if (initialLimit !== reactedTo) {
    setReactedTo(initialLimit);
    setValue(String(initialLimit));
    setSaved(false);
  }

  const isUnlimited = Number(value) === ORG_PROJECT_LIMIT_UNLIMITED_SENTINEL;

  const save = () => {
    const parsed = Number(value);
    setSaved(false);
    startTransition(async () => {
      const result = await updateOrganizationProjectLimit(orgId, parsed);
      setError(result.error);
      setSaved(!result.error);
    });
  };

  return (
    <div className="flex items-center gap-2">
      {isUnlimited ? (
        // The raw sentinel (2147483647, from a team/business plan) reads as
        // a bug if shown as a literal number - label it and only reveal the
        // numeric input if the admin actually wants to override it with a
        // real limit.
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-muted-foreground">Unlimited</span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-xs"
            onClick={() => setValue("1")}
            disabled={pending}
          >
            Set limit
          </Button>
        </div>
      ) : (
        <Input
          type="number"
          min={1}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSaved(false);
          }}
          disabled={pending}
          className="h-8 w-20"
        />
      )}
      <Button size="sm" variant="outline" onClick={save} disabled={pending}>
        Save
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
      {saved && !error && <span className="text-xs text-success">Saved</span>}
    </div>
  );
}
