import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { hasDirectDatabase } from "@/lib/db/pool";
import { SignupForm } from "./signup-form";

// See src/app/auth/login/page.tsx for why this must not be statically
// prerendered - DATABASE_URL is a runtime-only env var under Docker Compose.
export const dynamic = "force-dynamic";

export default async function SignupPage() {
  const t = await getTranslations("common");
  return (
    <Suspense fallback={<div>{t("loading")}</div>}>
      <SignupForm local={hasDirectDatabase()} />
    </Suspense>
  );
}
