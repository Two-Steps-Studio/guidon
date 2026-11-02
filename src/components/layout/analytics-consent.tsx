"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  readAnalyticsConsent,
  setAnalyticsConsent,
  subscribeAnalyticsConsent,
} from "@/lib/analytics-consent";

function useConsent() {
  return useSyncExternalStore(subscribeAnalyticsConsent, readAnalyticsConsent, () => "unavailable" as const);
}

/** Asks once, only when PostHog is configured, until the person answers. */
export function AnalyticsConsent() {
  const t = useTranslations("common.analyticsConsent");
  if (useConsent() !== "pending") return null;

  return (
    <section
      aria-label={t("label")}
      className="fixed inset-x-4 bottom-4 z-50 rounded-lg border bg-popover p-4 text-sm text-popover-foreground shadow-lg sm:right-auto sm:max-w-sm"
    >
      <p>
        {t.rich("message", {
          cookies: (chunks) => <Link href="/legal/cookies" className="underline">{chunks}</Link>,
        })}
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => setAnalyticsConsent("denied")}>
          {t("decline")}
        </Button>
        <Button size="sm" onClick={() => setAnalyticsConsent("granted")}>
          {t("allow")}
        </Button>
      </div>
    </section>
  );
}

/** Withdrawing or changing the choice: analytics stops at once and the question comes back. */
export function AnalyticsChoiceReset() {
  const t = useTranslations("common.analyticsConsent");
  const consent = useConsent();
  if (consent !== "granted" && consent !== "denied") return null;

  return (
    <Button variant="outline" onClick={() => setAnalyticsConsent(null)}>
      {t(consent === "granted" ? "withdraw" : "change")}
    </Button>
  );
}
