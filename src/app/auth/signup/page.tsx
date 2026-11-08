import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { hasDirectDatabase } from "@/lib/db/pool";
import { oauthSetup } from "@/lib/auth/oauth-providers";
import { SignupForm } from "./signup-form";
import { AuthFormSkeleton } from "@/components/auth/auth-form-skeleton";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create your Guidon account",
  description: "Create a Guidon account to start a project and organize your team's work.",
};

// See src/app/auth/login/page.tsx for why this must not be statically
// prerendered - DATABASE_URL is a runtime-only env var under Docker Compose.
export const dynamic = "force-dynamic";

export default async function SignupPage() {
  const t = await getTranslations("common");
  return (
    <Suspense fallback={<AuthFormSkeleton label={t("loading")} fields={3} />}>
      <SignupForm local={hasDirectDatabase()} oauth={oauthSetup(hasDirectDatabase())} />
    </Suspense>
  );
}
