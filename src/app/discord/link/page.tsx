import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { FolderKanban, LinkIcon } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentUser } from "@/lib/data/current-user";
import { listManageableProjectsForUser } from "@/lib/data/discord-integration";
import { verifyGuildLinkToken } from "@/lib/discord/guild-link-token";
import { DiscordLinkForm } from "./link-form";

/**
 * Landing page of the link the bot posts for `/guidon-link`. Not a public
 * route (proxy.ts requires a session), so getCurrentUser() only resolves for a
 * signed-in user. The token is verified again in the Server Action - what is
 * checked here only decides what to show.
 */
export default async function DiscordLinkPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token: rawToken } = await searchParams;
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;

  const t = await getTranslations("discordLink");
  const user = await getCurrentUser();
  const guild = verifyGuildLinkToken(token);

  if (!guild || !token) {
    return (
      <AppShell user={user}>
        <div className="container mx-auto max-w-2xl px-6 py-8">
          <EmptyState
            icon={LinkIcon}
            title={t("invalidTitle")}
            description={t("invalidDescription")}
            action={
              <Button asChild variant="outline">
                <Link href="/projects">{t("toProjects")}</Link>
              </Button>
            }
          />
        </div>
      </AppShell>
    );
  }

  const projects = await listManageableProjectsForUser(user.id);
  // "" is "no name", same as null (the bot only ever signs the real name, but
  // an empty Discord server name must not render as an empty title).
  const guildLabel = guild.guildName?.trim() || t("unnamedServer");

  return (
    <AppShell user={user}>
      <div className="container mx-auto max-w-2xl px-6 py-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LinkIcon className="h-5 w-5" />
              {t("title")}
            </CardTitle>
            <CardDescription>{t("description", { guild: guildLabel })}</CardDescription>
          </CardHeader>
          <CardContent>
            {projects.length === 0 ? (
              <EmptyState
                icon={FolderKanban}
                title={t("emptyTitle")}
                description={t("emptyDescription")}
                action={
                  <Button asChild variant="outline">
                    <Link href="/projects">{t("toProjects")}</Link>
                  </Button>
                }
              />
            ) : (
              <DiscordLinkForm token={token} guildLabel={guildLabel} projects={projects} />
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
