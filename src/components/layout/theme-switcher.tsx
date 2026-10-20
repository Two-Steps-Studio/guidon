"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { setTheme } from "@/app/actions/set-theme";
import { SelectMenu } from "@/components/ui/select-menu";
import { SUPPORTED_THEMES, type Theme } from "@/lib/theme";

interface ThemeSwitcherProps {
  /** Resolved server-side from the theme cookie - see layout.tsx. */
  currentTheme: Theme;
}

export function ThemeSwitcher({ currentTheme }: ThemeSwitcherProps) {
  const [isPending, startTransition] = useTransition();
  const t = useTranslations("profile");

  return (
    <SelectMenu
      aria-label={t("themeLabel")}
      value={currentTheme}
      disabled={isPending}
      options={SUPPORTED_THEMES.map((theme) => ({ value: theme, label: t(`theme_${theme}`) }))}
      onValueChange={(value) => {
        startTransition(async () => {
          await setTheme(value);
        });
      }}
    />
  );
}
