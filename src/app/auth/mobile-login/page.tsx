import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/data/current-user";
import { hasDirectDatabase } from "@/lib/db/pool";
import { getLocalSessionUserId } from "@/lib/auth/local-auth";
import { createClient } from "@/lib/supabase-server";
import { isValidCodeChallenge } from "@/lib/auth/mobile-login-core";
import { authorizeMobileLogin } from "./actions";

/**
 * Opened by the Guidon mobile app (mobile/) in the system browser with a
 * PKCE `code_challenge` (S256) and a `state` nonce. Same idea as
 * /auth/plugin-login - the real Guidon sign-in, password reset and OAuth
 * included - but the result goes back to the app on guidon://auth as a
 * one-time code, not an API key (lib/auth/mobile-login.ts says why).
 */

async function isSignedIn(): Promise<boolean> {
  if (hasDirectDatabase()) return (await getLocalSessionUserId()) !== null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user !== null;
}

export default async function MobileLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ code_challenge?: string; code_challenge_method?: string; state?: string }>;
}) {
  const { code_challenge: challenge, code_challenge_method: method, state } = await searchParams;
  const t = await getTranslations("auth.mobileLogin");

  if (!isValidCodeChallenge(challenge) || method !== "S256" || !state || state.length > 200) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{t("invalidTitle")}</CardTitle>
            <CardDescription>{t("invalidDescription")}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const returnTo = `/auth/mobile-login?code_challenge=${encodeURIComponent(challenge)}&code_challenge_method=S256&state=${encodeURIComponent(state)}`;
  if (!(await isSignedIn())) {
    redirect(`/auth/login?redirect=${encodeURIComponent(returnTo)}`);
  }

  const user = await getCurrentUser();
  const authorize = authorizeMobileLogin.bind(null, challenge, state);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            {t("title")}
          </CardTitle>
          <CardDescription>{t.rich("description", { email: user.email ?? "", b: (chunks) => <strong>{chunks}</strong> })}</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={authorize}>
            <Button type="submit" className="w-full">
              {t("allow")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
