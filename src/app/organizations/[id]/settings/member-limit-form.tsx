"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, Check, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveMemberProjectLimit, type MemberLimitState } from "./member-limit-actions";

const initialState: MemberLimitState = { error: null, saved: false };

/**
 * organizations.member_project_limit (migration 049). `available` is false
 * when the column doesn't exist yet - an instance that deployed this code
 * before running the migration - so the page still renders instead of failing.
 */
export function MemberLimitForm({
  organizationId,
  limit,
  available,
  canManage,
}: {
  organizationId: string;
  limit: number | null;
  available: boolean;
  canManage: boolean;
}) {
  const t = useTranslations("organizations.settings");
  const [state, formAction, saving] = useActionState(saveMemberProjectLimit.bind(null, organizationId), initialState);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          {t("memberLimitTitle")}
        </CardTitle>
        <CardDescription>{t("memberLimitDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!available ? (
          <p className="text-sm text-muted-foreground">{t("memberLimitUnavailable")}</p>
        ) : !canManage ? (
          <p className="text-sm text-muted-foreground">
            {limit === null ? t("memberLimitNone") : t("memberLimitCurrent", { limit })}
          </p>
        ) : (
          <form action={formAction} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="member-project-limit">{t("memberLimitLabel")}</Label>
              <Input
                id="member-project-limit"
                name="member_project_limit"
                type="number"
                inputMode="numeric"
                min={1}
                max={1000}
                step={1}
                defaultValue={limit ?? ""}
                placeholder={t("memberLimitPlaceholder")}
                className="max-w-40"
              />
              <p className="text-xs text-muted-foreground">{t("memberLimitHint")}</p>
            </div>
            {state.error && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {state.error}
              </div>
            )}
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={saving}>
                {saving ? t("saving") : t("save")}
              </Button>
              {state.saved && !saving && (
                <span className="flex items-center gap-1 text-sm text-muted-foreground" role="status">
                  <Check className="h-4 w-4" />
                  {t("memberLimitSaved")}
                </span>
              )}
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
