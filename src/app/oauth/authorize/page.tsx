import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Check, KeyRound, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/data/current-user";
import { hasDirectDatabase } from "@/lib/db/pool";
import { getLocalSessionUserId } from "@/lib/auth/local-auth";
import { createClient } from "@/lib/supabase-server";
import { checkAuthorizeRequest, type AuthorizeParams } from "@/lib/oauth/authorize-request";
import { decideAuthorization } from "./actions";

type ScopeKey = "tasks_read" | "tasks_write" | "tasks_status" | "comments_write" | "attempts_write" | "project_read" | "project_write";

export const metadata: Metadata = { title: "Connect an app", robots: { index: false } };

async function isSignedIn(): Promise<boolean> {
  if (hasDirectDatabase()) return (await getLocalSessionUserId()) !== null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user !== null;
}

function hostOf(uri: string): string {
  try {
    const url = new URL(uri);
    return url.host || `${url.protocol}//`;
  } catch {
    return uri;
  }
}

/**
 * OAuth consent: an MCP client (Claude, ChatGPT, Cursor...) sent the
 * person here to approve access to their Guidon account. Sign-in first
 * (the real login, OAuth providers included), then Allow / Cancel.
 */
export default async function AuthorizePage({ searchParams }: { searchParams: Promise<AuthorizeParams> }) {
  const params = await searchParams;
  const t = await getTranslations("oauth");

  const check = await checkAuthorizeRequest(params);
  if (check.kind === "fatal") {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{t("invalidTitle")}</CardTitle>
            <CardDescription>{t("invalidDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">{check.reason}</CardContent>
        </Card>
      </div>
    );
  }
  if (check.kind === "redirect") redirect(check.url);

  if (!(await isSignedIn())) {
    const query = new URLSearchParams(Object.entries(params).filter(([, v]) => typeof v === "string") as [string, string][]);
    redirect(`/auth/login?redirect=${encodeURIComponent(`/oauth/authorize?${query}`)}`);
  }
  const user = await getCurrentUser();
  const verified = check.client.kind === "cimd";

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            {t("title", { app: check.client.client_name })}
          </CardTitle>
          <CardDescription>{t.rich("signedInAs", { email: user.email ?? "", b: (chunks) => <strong>{chunks}</strong> })}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <p className="text-sm font-medium">{t("permissionsTitle")}</p>
            <ul className="space-y-1.5 text-sm">
              {check.scopes.map((scope) => (
                <li key={scope} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                  {t(`scopes.${scope.replace(":", "_") as ScopeKey}`)}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">{t("limits")}</p>
          </div>

          <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            {verified ? (
              <p>{t("fromSite", { host: hostOf(check.client.client_id) })}</p>
            ) : (
              <p className="flex items-start gap-2">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
                {t("unverified")}
              </p>
            )}
            <p className="mt-1.5">{t("redirectNote", { host: hostOf(check.redirectUri) })}</p>
          </div>

          <form action={decideAuthorization} className="flex gap-2">
            {Object.entries(params).map(([name, value]) =>
              typeof value === "string" ? <input key={name} type="hidden" name={name} value={value} /> : null
            )}
            <Button type="submit" name="decision" value="deny" variant="outline" className="flex-1">
              {t("deny")}
            </Button>
            <Button type="submit" name="decision" value="allow" className="flex-1">
              {t("allow")}
            </Button>
          </form>
          <p className="text-center text-xs text-muted-foreground">{t("revokeHint")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
