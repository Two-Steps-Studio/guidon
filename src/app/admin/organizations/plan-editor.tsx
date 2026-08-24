"use client";

import { useState, useTransition } from "react";
import { updateOrganizationPlan } from "./actions";

const PLAN_OPTIONS = [
  { value: "free", label: "Free" },
  { value: "pro", label: "Pro" },
  { value: "team", label: "Team" },
  { value: "business", label: "Business" },
];

export function PlanEditor({
  orgId,
  initialPlanId,
}: {
  orgId: string;
  initialPlanId: string;
}) {
  const [value, setValue] = useState(initialPlanId);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const save = (planId: string) => {
    setValue(planId);
    startTransition(async () => {
      const result = await updateOrganizationPlan(orgId, planId);
      setError(result.error);
    });
  };

  return (
    <div className="flex items-center gap-2">
      <select
        value={value}
        onChange={(e) => save(e.target.value)}
        disabled={pending}
        className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
      >
        {PLAN_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
