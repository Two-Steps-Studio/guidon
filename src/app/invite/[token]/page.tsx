import Link from "next/link";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { MailX, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/data/current-user";
import { dataClient } from "@/lib/data-client";
import { isWellFormedInvitationToken } from "@/lib/invitations";
import { AcceptInvitationButton } from "./accept-button";

export const metadata: Metadata = {
  title: "Invitation",
  robots: { index: false, follow: false },
};

interface Preview {
  status: string;
  email: string;
  role: string;
  organization_id: string | null;
  project_id: string | null;
  target_name: string | null;
  inviter_name: string | null;
  expires_at: string | Date;
}

/**
 * /invite/<token> - an invitation link from an email (migration 091). The
 * proxy sends a signed-out visitor to /auth/login?redirect=/invite/<token>
 * first (and from there to sign-up with the same redirect), so this page
 * always has a user. What the invitation is for comes from
 * public.invitation_preview; accepting is public.accept_invitation.
 */
export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getTranslations("invitation");
  const tRole = await getTranslations("organizations.common");
  const format = await getFormatter();
  const user = await getCurrentUser();

  let invitation: Preview | undefined;
  if (isWellFormedInvitationToken(token)) {
    const { data } = await dataClient(user.id).rpcRows<Preview>("invitation_preview", { p_token: token });
    invitation = data?.[0];
  }

  const problem = !invitation
    ? t("invalid")
    : invitation.status === "expired"
      ? t("expired")
      : invitation.status !== "pending"
        ? t("used")
        : null;
  const emailMatches = !!invitation && (user.email ?? "").toLowerCase() === invitation.email.toLowerCase();

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-md">
        {problem || !invitation ? (
          <>
            <CardHeader>
              <MailX className="mb-2 h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <CardTitle>{t("unavailableTitle")}</CardTitle>
              <CardDescription>{problem}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full">
                <Link href="/dashboard">{t("toDashboard")}</Link>
              </Button>
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader>
              <Users className="mb-2 h-8 w-8 text-primary" aria-hidden="true" />
              <CardTitle>{t("title", { name: invitation.target_name ?? "" })}</CardTitle>
              <CardDescription>
                {t("description", {
                  inviter: invitation.inviter_name ?? t("someone"),
                  name: invitation.target_name ?? "",
                  role: tRole("role", { role: invitation.role }),
                })}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {t("expires", { date: format.dateTime(new Date(invitation.expires_at), { dateStyle: "medium" }) })}
              </p>
              {emailMatches ? (
                <AcceptInvitationButton token={token} />
              ) : (
                <div className="space-y-3">
                  <p role="alert" className="rounded-md border border-warning/40 bg-warning/5 p-3 text-sm">
                    {t("wrongAccount", { invited: invitation.email, current: user.email ?? "" })}
                  </p>
                  <Button asChild variant="outline" className="w-full">
                    <Link href="/auth/logout">{t("signOut")}</Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </>
        )}
      </Card>
    </main>
  );
}
