"use client";

import { useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Clock, X } from "lucide-react";
import { cancelInvitation } from "./actions";

export interface PendingInvitation {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  expired: boolean;
}

/** Invitations sent to addresses without an account yet (migration 091), for owners/admins. */
export function PendingInvitations({ orgId, invitations }: { orgId: string; invitations: PendingInvitation[] }) {
  const t = useTranslations("organizations.members");
  const tCommon = useTranslations("organizations.common");
  const format = useFormatter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (invitations.length === 0) return null;

  const cancel = (id: string) => {
    setPendingId(id);
    startTransition(async () => {
      const result = await cancelInvitation(orgId, id);
      setError(result.error);
      setPendingId(null);
    });
  };

  return (
    <section aria-labelledby="pending-invitations" className="mb-6">
      <h2 id="pending-invitations" className="mb-3 text-sm font-medium text-muted-foreground">
        {t("pendingTitle", { count: invitations.length })}
      </h2>
      {error && (
        <p className="mb-2 flex items-center gap-1 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          {error}
        </p>
      )}
      <div className="space-y-2">
        {invitations.map((invitation) => {
          return (
            <Card key={invitation.id}>
              <CardContent className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{invitation.email}</p>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    {invitation.expired
                      ? t("pendingExpired")
                      : t("pendingExpires", { date: format.dateTime(new Date(invitation.expiresAt), { dateStyle: "medium" }) })}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="outline">{tCommon("role", { role: invitation.role })}</Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => cancel(invitation.id)}
                    disabled={pendingId === invitation.id}
                    aria-label={t("cancelInvitationFor", { email: invitation.email })}
                  >
                    <X className="mr-1 h-4 w-4" aria-hidden="true" />
                    {t("cancelInvitation")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
