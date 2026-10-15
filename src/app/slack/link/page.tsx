import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { FolderKanban, LinkIcon } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentUser } from "@/lib/data/current-user";
import { listSlackLinkableProjects } from "@/lib/data/slack-integration";
import { verifySlackLinkToken } from "@/lib/slack/link-token";
import { SlackLinkForm } from "./link-form";

/**
 * Landing page of the link `/guidon link` posts in Slack. Requires a session
 * (proxy.ts), so whoever confirms is signed in; the token is verified again
 * in the Server Action - here it only decides what to show.
 */
export default async function SlackLinkPage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const { token: rawToken } = await searchParams;
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;

  const t = await getTranslations("slackLink");
  const user = await getCurrentUser();
  const channel = verifySlackLinkToken(token, process.env.AUTH_SECRET ?? "");

  if (!channel || !token) {
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

  const projects = await listSlackLinkableProjects(user.id);
  const channelLabel = channel.channelName ? `#${channel.channelName}` : t("unnamedChannel");
  const workspaceLabel = channel.teamName || t("unnamedWorkspace");

  return (
    <AppShell user={user}>
      <div className="container mx-auto max-w-2xl px-6 py-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LinkIcon className="h-5 w-5" />
              {t("title")}
            </CardTitle>
            <CardDescription>{t("description", { channel: channelLabel, workspace: workspaceLabel })}</CardDescription>
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
              <SlackLinkForm token={token} projects={projects} />
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
