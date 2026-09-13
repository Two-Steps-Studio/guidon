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

  // auth/callback/route.ts already exchanged the recovery link's code for
  // a real session before redirecting here - no session means the link was
  // invalid, expired, or already used.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  return <ResetPasswordForm />;
}
