"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertTriangle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { confirmationMatches, type DeletionPlan } from "@/lib/account/account-deletion-core";
import { deleteMyAccount } from "./delete-account-actions";

/**
 * Profile -> Delete account. Says up front which organizations go with the
 * account and which have to be handed over first; typing the email is the
 * confirmation. Afterwards the session is ended through /auth/logout.
 */
export function DeleteAccountSection({ email, plan }: { email: string; plan: DeletionPlan }) {
  const t = useTranslations("profile.deleteAccount");
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const blocked = plan.blockers.length > 0;
  const confirmed = confirmationMatches(typed, email);

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const result = await deleteMyAccount(typed);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.replace("/auth/logout");
    });

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <Trash2 className="h-5 w-5" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {plan.deleteOrganizations.length > 0 && (
          <div>
            <p className="font-medium">{t("orgsDeleted")}</p>
            <ul className="mt-1 list-disc pl-5 text-muted-foreground">
              {plan.deleteOrganizations.map((org) => (
                <li key={org.id}>{org.name}</li>
              ))}
            </ul>
          </div>
        )}
        {plan.leaveOrganizations.length > 0 && (
          <div>
            <p className="font-medium">{t("orgsLeft")}</p>
            <ul className="mt-1 list-disc pl-5 text-muted-foreground">
              {plan.leaveOrganizations.map((org) => (
                <li key={org.id}>{org.name}</li>
              ))}
            </ul>
          </div>
        )}

        {blocked ? (
          <div role="alert" className="flex gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
            <div>
              <p className="font-medium">{t("blockedTitle")}</p>
              <p className="text-muted-foreground">{t("blockedDescription", { names: plan.blockers.map((org) => org.name).join(", ") })}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="delete-account-email">{t("confirmLabel", { email })}</Label>
            <Input id="delete-account-email" value={typed} autoComplete="off" onChange={(event) => setTyped(event.target.value)} />
            <Button variant="destructive" disabled={!confirmed || pending} onClick={submit}>
              <Trash2 className="h-4 w-4" />
              {pending ? t("deleting") : t("button")}
            </Button>
            {error && (
              <p role="alert" className="text-destructive">
                {error}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
