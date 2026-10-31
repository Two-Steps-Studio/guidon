"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { BillingInterval } from "@/lib/billing/billing-core";
import { createCheckoutSession, createPortalSession } from "./actions";
import posthog from "posthog-js";

/**
 * Both actions redirect on success (Stripe Checkout / the Customer Portal),
 * so `await action(...)` only ever resolves here on failure - same
 * useTransition + local error state shape as ProjectLimitEditor
 * (src/app/admin/organizations/project-limit-editor.tsx).
 */

export function UpgradeButton({
  organizationId,
  planId,
  interval,
  label,
}: {
  organizationId: string;
  planId: string;
  interval: BillingInterval;
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
          posthog.capture("billing_checkout_started", { plan_id: planId, billing_interval: interval });
          startTransition(async () => {
            const result = await createCheckoutSession(organizationId, planId, interval);
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
