import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LinkIcon, LogIn } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentUser } from "@/lib/data/current-user";
import { verifyUserLoginToken } from "@/lib/discord/guild-link-token";
import { DiscordLoginForm } from "./login-form";

/**
 * Landing page of the link the bot posts for `/guidon-login` - the Discord
 * counterpart of /auth/plugin-login. Requires a session (proxy.ts); the token
 * is verified again in the Server Action.
 */
export default async function DiscordLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token: rawToken } = await searchParams;
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;

  const t = await getTranslations("discordLogin");
  const user = await getCurrentUser();
  const discord = verifyUserLoginToken(token);

  return (
    <AppShell user={user}>
      <div className="container mx-auto max-w-2xl px-6 py-8">
        {!discord || !token ? (
          <EmptyState
            icon={LinkIcon}
            title={t("invalidTitle")}
            description={t("invalidDescription")}
            action={
              <Button asChild variant="outline">
                <Link href="/dashboard">{t("toDashboard")}</Link>
              </Button>
            }
          />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LogIn className="h-5 w-5" />
                {t("title")}
              </CardTitle>
              <CardDescription>
                {t("description", {
                  discord: discord.discordUsername?.trim() || t("unnamedAccount"),
                  account: user.full_name || user.email || "",
                })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DiscordLoginForm token={token} />
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
