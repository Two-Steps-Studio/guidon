"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { setTheme } from "@/app/actions/set-theme";
import { Select } from "@/components/ui/select";
import { SUPPORTED_THEMES, type Theme } from "@/lib/theme";

interface ThemeSwitcherProps {
  /** Resolved server-side from the theme cookie - see layout.tsx. */
  currentTheme: Theme;
}

export function ThemeSwitcher({ currentTheme }: ThemeSwitcherProps) {
  const [isPending, startTransition] = useTransition();
  const t = useTranslations("profile");

  return (
    <Select
      aria-label={t("themeLabel")}
      value={currentTheme}
      disabled={isPending}
      onChange={(event) => {
        const value = event.target.value;
        startTransition(async () => {
          await setTheme(value);
        });
      }}
    >
      {SUPPORTED_THEMES.map((theme) => (
        <option key={theme} value={theme}>
          {t(`theme_${theme}`)}
        </option>
      ))}
    </Select>
  );
}
