"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { createCheckoutSession, createPortalSession } from "./actions";

/**
 * Both actions redirect on success (Stripe Checkout / the Customer Portal),
 * so `await action(...)` only ever resolves here on failure - same
 * useTransition + local error state shape as ProjectLimitEditor
 * (src/app/admin/organizations/project-limit-editor.tsx).
 */

export function UpgradeButton({
  organizationId,
  planId,
  label,
}: {
  organizationId: string;
  planId: string;
  label: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await createCheckoutSession(organizationId, planId);
            if (result.error) setError(result.error);
          });
        }}
      >
        {label}
      </Button>
      {error && <span className="max-w-[16rem] text-right text-xs text-destructive">{error}</span>}
    </div>
  );
}

export function ManageBillingButton({ organizationId, label }: { organizationId: string; label: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await createPortalSession(organizationId);
            if (result.error) setError(result.error);
          });
        }}
      >
        {label}
      </Button>
      {error && <span className="max-w-[16rem] text-right text-xs text-destructive">{error}</span>}
    </div>
  );
}
