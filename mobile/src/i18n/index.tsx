import { getLocales, useLocales } from "expo-localization";
import { createContext, useContext, useLayoutEffect, useMemo, type ReactNode } from "react";
import de from "./de";
import en, { type Messages } from "./en";
import es from "./es";
import pl from "./pl";

/**
 * A deliberately tiny i18n: the app's language follows the system (no in-app
 * switch), falls back to English, and `t("section.key", { param })` is typed
 * against the English catalogue so a missing key fails `tsc`.
 */

export const LANGUAGES = { en, pl, de, es } as const;
export type Language = keyof typeof LANGUAGES;

type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

export type MessageKey = Leaves<Messages>;
export type TParams = Record<string, string | number>;
export type TFunction = (key: MessageKey, params?: TParams) => string;

const NATIVE_NAMES: Record<Language, string> = { en: "English", pl: "Polski", de: "Deutsch", es: "Español" };

type LocaleState = { language: Language; localeTag: string };

function resolve(locales: ReturnType<typeof getLocales>): LocaleState {
  for (const locale of locales) {
    const code = locale.languageCode?.toLowerCase();
    if (code && code in LANGUAGES) return { language: code as Language, localeTag: locale.languageTag };
  }
  return { language: "en", localeTag: locales[0]?.languageTag ?? "en" };
}

let current: LocaleState = resolve(getLocales());

function lookup(messages: Messages, key: string): string | undefined {
  let node: unknown = messages;
  for (const part of key.split(".")) {
    if (node && typeof node === "object" && part in node) node = (node as Record<string, unknown>)[part];
    else return undefined;
  }
  return typeof node === "string" ? node : undefined;
}

function translate(language: Language, key: MessageKey, params?: TParams): string {
  const template = lookup(LANGUAGES[language], key) ?? lookup(en, key) ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

/** For code outside React (mutation callbacks, toasts): uses the current system language. */
export const t: TFunction = (key, params) => translate(current.language, key, params);

export function currentLocaleTag(): string {
  return current.localeTag;
}

/** Looks up a key that may not exist (e.g. a built-in column label for an arbitrary status). */
export function tOptional(key: string): string | undefined {
  return lookup(LANGUAGES[current.language], key);
}

type I18nValue = { t: TFunction; language: Language; languageName: string; localeTag: string };

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const locales = useLocales();
  const state = useMemo(() => resolve(locales), [locales]);
  // Non-React callers (toasts from mutation callbacks) read the module-level copy.
  useLayoutEffect(() => {
    current = state;
  }, [state]);
  const value = useMemo<I18nValue>(
    () => ({
      t: (key, params) => translate(state.language, key, params),
      language: state.language,
      languageName: NATIVE_NAMES[state.language],
      localeTag: state.localeTag,
    }),
    [state]
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider");
  return value;
}
