"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { readStoredOnboarding, storeOnboarding } from "@/lib/onboarding";
import { completeOnboarding } from "./actions";

export function FinishOnboarding() {
  const t = useTranslations("onboarding");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    // Once, even under StrictMode's double effect in development.
    if (started.current) return;
    started.current = true;
    const answers = readStoredOnboarding();
    if (!answers) {
      router.replace("/dashboard");
      return;
    }
    completeOnboarding(answers).then((result) => {
      if (result.error || !result.projectId) {
        setError(result.error ?? t("finishFailed"));
        return;
      }
      storeOnboarding(null);
      router.replace(`/projects/${result.projectId}/work?welcome=1`);
    });
  }, [router, t]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      {error ? (
        <>
          <p className="max-w-sm text-sm text-destructive">{error}</p>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href="/start">{t("back")}</Link>
            </Button>
            <Button asChild>
              <Link href="/dashboard">{t("skipToDashboard")}</Link>
            </Button>
          </div>
        </>
      ) : (
        <>
          <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
          <p className="text-sm text-muted-foreground">{t("finishing")}</p>
        </>
      )}
    </div>
  );
}
