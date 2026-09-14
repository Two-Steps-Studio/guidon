import { redirect } from "next/navigation";
import { hasDirectDatabase } from "@/lib/db/pool";
import { createClient } from "@/lib/supabase-server";
import { ResetPasswordForm } from "./reset-password-form";

// Same reasoning as forgot-password/page.tsx and login/page.tsx.
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  // Self-hosted has no email-sending capability at all - this feature
  // doesn't exist there, same as OAuth doesn't.
  if (hasDirectDatabase()) {
    redirect("/auth/login");
  }

  // auth/reset-password/verify/route.ts already verified the recovery
  // token and established a real session (a page component can't persist
  // cookies itself - see that route's own comment) before redirecting
  // here - no session means the link was invalid, expired, or already
  // used.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  return <ResetPasswordForm />;
}
