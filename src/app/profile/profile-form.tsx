"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import { updateProfile, type ProfileFormState } from "./actions";
import type { CurrentUser } from "@/lib/data/current-user";
import { LanguageSwitcher } from "@/components/layout/language-switcher";

const initialState: ProfileFormState = { error: null };

export function ProfileForm({ user }: { user: CurrentUser }) {
  const t = useTranslations("profile");
  const [state, formAction, pending] = useActionState(updateProfile, initialState);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarImage src={user.avatar_url || undefined} />
            <AvatarFallback className="text-lg">
              {user.full_name?.[0] || user.email?.[0] || "U"}
            </AvatarFallback>
          </Avatar>
          <div>
            <CardTitle>{user.full_name || t("unnamed")}</CardTitle>
            <CardDescription>{user.email}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="full_name">{t("nameLabel")}</Label>
            <Input
              id="full_name"
              name="full_name"
              defaultValue={user.full_name ?? ""}
              placeholder={t("namePlaceholder")}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="avatar">{t("avatarLabel")}</Label>
            <Input
              id="avatar"
              name="avatar"
              type="file"
              accept="image/*"
            />
            <p className="text-xs text-muted-foreground">
              {t("avatarHelp")}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">{t("emailLabel")}</Label>
            <Input id="email" value={user.email ?? ""} disabled />
            <p className="text-xs text-muted-foreground">
              {t("emailHelp")}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="language">{t("languageLabel")}</Label>
            <LanguageSwitcher />
          </div>

          {state.error && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {state.error}
            </div>
          )}

          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("saving")}
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  {t("saveChanges")}
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
