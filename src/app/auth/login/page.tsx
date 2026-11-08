import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { hasDirectDatabase } from "@/lib/db/pool";
import { oauthSetup } from "@/lib/auth/oauth-providers";
import { LoginForm } from "./login-form";
import { AuthFormSkeleton } from "@/components/auth/auth-form-skeleton";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in to your Guidon workspace",
  description: "Sign in to Guidon to access your projects, tasks and team workspace.",
};

// hasDirectDatabase() reads process.env.DATABASE_URL, which Docker Compose
// sets at container runtime, not at `npm run build` time (see
// docker-compose.yml - it's under `environment:`, not `build.args:`). Without
// this, Next's static optimizer prerenders this page once at build time, when
// DATABASE_URL is unset, and bakes `local=false` into the HTML forever.
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const t = await getTranslations("common");
  return (
    <Suspense fallback={<AuthFormSkeleton label={t("loading")} fields={2} />}>
      <LoginForm local={hasDirectDatabase()} oauth={oauthSetup(hasDirectDatabase())} />
    </Suspense>
  );
}
