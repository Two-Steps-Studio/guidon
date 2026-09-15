import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { createClient } from "@/lib/supabase-server";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "./locales";
import { loadMessages } from "./load-messages";

const LOCALE_COOKIE = "NEXT_LOCALE";

/**
 * Picks the best-matching supported locale from an Accept-Language header,
 * e.g. "pl-PL,pl;q=0.9,en;q=0.8" -> "pl". No cookie is written here -
 * detection re-runs every request until something explicit (a cookie or a
 * saved profile) exists, so a visitor who changes their browser language
 * before ever picking one in the app keeps getting matched correctly.
 */
function detectLocaleFromHeader(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const preferred = acceptLanguage
    .split(",")
    .map((part) => part.split(";")[0].trim().toLowerCase().split("-")[0]);
  for (const lang of preferred) {
    if (isSupportedLocale(lang)) return lang;
  }
  return DEFAULT_LOCALE;
}

export default getRequestConfig(async () => {
  let locale: Locale = DEFAULT_LOCALE;

  // 1. A logged-in user's saved preference wins - cross-device source of
  // truth once they've ever picked a language. Only queried in hosted mode
  // here; self-hosted's withUser() path needs a userId this request-config
  // callback doesn't have, so self-hosted relies on the cookie/header below
  // (getUser() still works there via the local-auth session cookie for the
  // Supabase-shaped client, see supabase-server.ts).
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("locale")
        .eq("id", user.id)
        .maybeSingle();
      if (profile?.locale && isSupportedLocale(profile.locale)) {
        locale = profile.locale;
        return { locale, messages: await loadMessages(locale) };
      }
    }
  } catch {
    // No session, or the query failed - fall through to cookie/header.
  }

  // 2. An explicit cookie (set by the language switcher, or by an
  // earlier visit before a profile lookup was possible).
  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (cookieLocale && isSupportedLocale(cookieLocale)) {
    locale = cookieLocale;
    return { locale, messages: await loadMessages(locale) };
  }

  // 3. Accept-Language header detection, no cookie written.
  locale = detectLocaleFromHeader((await headers()).get("accept-language"));

  return { locale, messages: await loadMessages(locale) };
});
