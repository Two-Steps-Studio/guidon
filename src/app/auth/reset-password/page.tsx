import { redirect } from "next/navigation";
import { hasDirectDatabase } from "@/lib/db/pool";
import { createClient } from "@/lib/supabase-server";
import { ResetPasswordForm } from "./reset-password-form";

// Same reasoning as forgot-password/page.tsx and login/page.tsx.
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string }>;
}) {
  // Self-hosted has no email-sending capability at all - this feature
  // doesn't exist there, same as OAuth doesn't.
  if (hasDirectDatabase()) {
    redirect("/auth/login");
  }

  const { token_hash, type } = await searchParams;
  const supabase = await createClient();

  if (token_hash && type === "recovery") {
    // Establishes the session from the emailed recovery link. Uses
    // verifyOtp (not the PKCE code-exchange /auth/callback already uses
    // for OAuth) because forgot-password/actions.ts's admin-generated
    // link was never paired with a browser-side PKCE challenge - see that
    // file's own comment for why. No PKCE state is needed here at all;
    // verifyOtp completes the token-hash verification directly.
    const { error } = await supabase.auth.verifyOtp({ token_hash, type: "recovery" });

    if (error) {
      redirect(
        "/auth/login?error=" +
          encodeURIComponent("That reset link is invalid or has expired.")
      );
    }
  } else {
    // No recovery token in the URL - only reachable with an existing,
    // already-established session (e.g. a user manually navigating here).
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/auth/login");
    }
  }

  return <ResetPasswordForm />;
}
