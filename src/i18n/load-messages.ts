import type { Locale } from "./locales";

/**
 * Same shape next-intl's `AppConfig.Messages` module augmentation in
 * global.d.ts uses (`typeof import("./messages/en.json")`) - redeclared
 * here (rather than imported, since that alias isn't exported from
 * global.d.ts) so callers get a real message shape instead of `any`.
 */
export type Messages = typeof import("../../messages/en.json");

/**
 * Loads a locale's message catalog via dynamic import. Shared by
 * src/i18n/request.ts (next-intl's request config, which reads
 * cookies()/headers()/a Supabase client to pick the locale before calling
 * this) and src/lib/email/resend.ts (a Server Action email sender with no
 * request context to read a locale from). This leaf module itself has no
 * reason to ever import cookies()/headers()/createClient(), so pulling it
 * into an email-sending context - which might run outside a request -
 * can't accidentally drag those request-scoped APIs along with it.
 */
export async function loadMessages(locale: Locale): Promise<Messages> {
  return (await import(`../../messages/${locale}.json`)).default;
}
