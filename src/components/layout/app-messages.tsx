import { NextIntlClientProvider } from "next-intl";

/**
 * The full translation catalog for client components inside the app. The
 * root layout only sends the public subset (src/i18n/client-messages.ts);
 * rendered from a Server Component with no `messages` prop, this provider
 * inherits all of them from the request's i18n config.
 */
export function AppMessages({ children }: { children: React.ReactNode }) {
  return <NextIntlClientProvider>{children}</NextIntlClientProvider>;
}
