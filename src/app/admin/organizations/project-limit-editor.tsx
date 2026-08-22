"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateOrganizationProjectLimit } from "./actions";

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

  const save = () => {
    const parsed = Number(value);
    startTransition(async () => {
      const result = await updateOrganizationProjectLimit(orgId, parsed);
      setError(result.error);
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        min={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={pending}
        className="h-8 w-20"
      />
      <Button size="sm" variant="outline" onClick={save} disabled={pending}>
        Save
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
