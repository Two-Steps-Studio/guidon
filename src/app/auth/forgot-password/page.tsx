import { redirect } from "next/navigation";
import { hasDirectDatabase } from "@/lib/db/pool";
import { ForgotPasswordForm } from "./forgot-password-form";

// hasDirectDatabase() reads DATABASE_URL, which Docker Compose sets at
// container runtime, not `npm run build` time - see login/page.tsx's own
// comment for the full reasoning; without this the self-hosted redirect
// below could get baked in as "never happens" at build time.
export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  // Self-hosted has no email-sending capability at all - this feature
  // doesn't exist there, same as OAuth doesn't.
  if (hasDirectDatabase()) {
    redirect("/auth/login");
  }

  return <ForgotPasswordForm />;
}
