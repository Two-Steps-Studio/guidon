"use client";

import { useSafeActionState } from "@/lib/forms/use-safe-action-state";
import { useEffect } from "react";


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
import { BackgroundMotionSwitcher } from "@/components/layout/background-motion-switcher";
import { WallpaperPicker } from "@/components/layout/wallpaper-picker";
import { initialsFor } from "@/lib/people";
import { SoundSwitcher } from "@/components/layout/sound-switcher";
import { submitKeepingValues } from "@/lib/forms/submit-keeping-values";

const initialState: ProfileFormState = { error: null };

export function ProfileForm({ user }: { user: CurrentUser }) {
  const [state, formAction, pending] = useSafeActionState(updateProfile, initialState);
  const t = useTranslations("profile");
  useEffect(() => {
    if (state.field) document.getElementById(state.field)?.focus();
  }, [state]);
  const fieldProps = (field: ProfileFormState["field"]) => state.field === field
    ? { "aria-invalid": true, "aria-describedby": "profile-field-error" }
    : {};
  const fieldError = (field: ProfileFormState["field"]) => state.field === field && state.error
    ? <p id="profile-field-error" role="alert" className="text-sm text-destructive">{state.error}</p>
    : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarImage src={user.avatar_url || undefined} />
            <AvatarFallback className="text-lg">
              {initialsFor(user)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 [overflow-wrap:anywhere]">
            <CardTitle>{user.full_name || t("unnamedUser")}</CardTitle>
            <CardDescription>{user.email}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={(event) => submitKeepingValues(event, formAction)} className="space-y-4" data-save-shortcut>
          <div className="space-y-2">
            <Label htmlFor="full_name">{t("nameLabel")}</Label>
            <Input
              id="full_name"
              name="full_name"
              {...fieldProps("full_name")}
              defaultValue={user.full_name ?? ""}
              placeholder={t("namePlaceholder")}
              required
            />
            {fieldError("full_name")}
          </div>

          <div className="space-y-2">
            <Label htmlFor="avatar">{t("avatarLabel")}</Label>
            <Input
              id="avatar"
              name="avatar"
              {...fieldProps("avatar")}
              type="file"
              accept="image/*"
            />
            {fieldError("avatar")}
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

          <div className="space-y-2">
            <Label>{t("backgroundStyleLabel")}</Label>
            <BackgroundMotionSwitcher />
            <p className="text-xs text-muted-foreground">{t("backgroundMotionHelp")}</p>
          </div>

          <div className="space-y-2">
            <Label>{t("wallpaperLabel")}</Label>
            <WallpaperPicker />
            <p className="text-xs text-muted-foreground">{t("wallpaperHelp")}</p>
          </div>

          <div className="space-y-2">
            <Label>{t("soundsLabel")}</Label>
            <SoundSwitcher />
            <p className="text-xs text-muted-foreground">{t("soundsHelp")}</p>
          </div>

          {state.error && !state.field && (
            <div role="alert" className="flex items-center gap-2 text-sm text-destructive">
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
