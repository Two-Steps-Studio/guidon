"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { setLocale } from "@/app/actions/set-locale";
import { Select } from "@/components/ui/select";
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
    <Select
      aria-label={t("languageLabel")}
      value={currentLocale}
      disabled={isPending}
      onChange={(event) => {
        const value = event.target.value;
        startTransition(async () => {
          await setLocale(value);
        });
      }}
    >
      {SUPPORTED_LOCALES.map((locale) => (
        <option key={locale} value={locale}>
          {LOCALE_LABELS[locale]}
        </option>
      ))}
    </Select>
  );
}
