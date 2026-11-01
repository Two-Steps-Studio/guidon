"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { setLocale } from "@/app/actions/set-locale";
import { SelectMenu, SIDEBAR_SELECT_CLASS_NAME } from "@/components/ui/select-menu";
import { Languages } from "lucide-react";
import { SUPPORTED_LOCALES } from "@/i18n/locales";

const LOCALE_LABELS: Record<string, string> = {
  en: "English",
  pl: "Polski",
  de: "Deutsch",
  es: "Español",
};

export function LanguageSwitcher() {
  const currentLocale = useLocale();
  const [isPending, startTransition] = useTransition();
  const t = useTranslations("profile");

  return (
    <SelectMenu
      aria-label={t("languageLabel")}
      dataTour="language"
      value={currentLocale}
      className={SIDEBAR_SELECT_CLASS_NAME}
      disabled={isPending}
      options={SUPPORTED_LOCALES.map((locale) => ({ value: locale, label: LOCALE_LABELS[locale], icon: <Languages aria-hidden className="size-4 shrink-0" /> }))}
      onValueChange={(value) => {
        startTransition(async () => {
          await setLocale(value);
        });
      }}
    />
  );
}
