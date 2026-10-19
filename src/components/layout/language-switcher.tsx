"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { setLocale } from "@/app/actions/set-locale";
import { SelectMenu } from "@/components/ui/select-menu";
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
      value={currentLocale}
      disabled={isPending}
      options={SUPPORTED_LOCALES.map((locale) => ({ value: locale, label: LOCALE_LABELS[locale] }))}
      onValueChange={(value) => {
        startTransition(async () => {
          await setLocale(value);
        });
      }}
    />
  );
}
