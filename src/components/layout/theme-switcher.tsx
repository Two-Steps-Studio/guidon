"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { setTheme } from "@/app/actions/set-theme";
import { SelectMenu, SIDEBAR_SELECT_CLASS_NAME } from "@/components/ui/select-menu";
import { Sun, Moon, Monitor } from "lucide-react";
import { SUPPORTED_THEMES, type Theme } from "@/lib/theme";

interface ThemeSwitcherProps {
  /** Resolved server-side from the theme cookie - see layout.tsx. */
  currentTheme: Theme;
}

export function ThemeSwitcher({ currentTheme }: ThemeSwitcherProps) {
  const [isPending, startTransition] = useTransition();
  const t = useTranslations("profile");
  const icons = { light: Sun, dark: Moon, system: Monitor };

  return (
    <SelectMenu
      aria-label={t("themeLabel")}
      value={currentTheme}
      className={SIDEBAR_SELECT_CLASS_NAME}
      disabled={isPending}
      options={SUPPORTED_THEMES.map((theme) => { const Icon = icons[theme]; return { value: theme, label: t(`theme_${theme}`), icon: <Icon aria-hidden className="size-4 shrink-0" /> }; })}
      onValueChange={(value) => {
        startTransition(async () => {
          await setTheme(value);
        });
      }}
    />
  );
}
