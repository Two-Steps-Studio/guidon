import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { Toaster } from "sonner";
import { hasDirectDatabase } from "@/lib/db/pool";
import { SITE_URL } from "@/lib/site-url";
import { DEFAULT_THEME, THEME_COOKIE, isSupportedTheme } from "@/lib/theme";
import "./globals.css";

const GA_MEASUREMENT_ID = "G-7PBQ5Y339N";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

const SITE_NAME = "Guidon";
const SITE_TITLE = "Guidon - Context-First Project Management";
const SITE_DESCRIPTION =
  "Guidon is context-first project management for development teams: track tasks, decisions, sources, and project memory together, so the \"why\" behind your work never gets lost.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "project management",
    "context-first project management",
    "task board",
    "decision log",
    "knowledge base",
    "AI task management",
    "developer project management",
    "roadmap planning",
  ],
  alternates: {
    canonical: "/",
  },
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    statusBarStyle: "default",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    // Image comes from src/app/opengraph-image.tsx (Next's file-convention
    // OG image, generated at request time) - a properly sized 1200x630
    // branded card instead of the raw wordmark logo asset previously listed
    // here, which most link-preview surfaces rendered as a mostly-empty
    // card (wrong aspect ratio, transparent background).
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  // "system" (the default) sets no data-theme attribute at all, so
  // globals.css's `@media (prefers-color-scheme: dark)` block picks
  // light/dark exactly as it always has. An explicit light/dark choice
  // (theme-switcher.tsx) sets data-theme, which globals.css's
  // `:root[data-theme="dark"]`/`:root:not([data-theme="light"])` rules
  // already know how to override - reading the cookie here and setting the
  // attribute server-side (rather than a client-side effect) means the
  // correct theme paints on the very first frame, no flash of the other
  // theme while JS hydrates.
  const themeCookie = (await cookies()).get(THEME_COOKIE)?.value;
  const theme = themeCookie && isSupportedTheme(themeCookie) ? themeCookie : DEFAULT_THEME;

  return (
    <html
      lang={locale}
      data-theme={theme === "system" ? undefined : theme}
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
    >
      <body className="min-h-screen bg-background text-foreground">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <main>{children}</main>
          {/* theme defaults to "light" and does NOT track the OS on its own
              (ask-sonner), so it must be told explicitly - "system" follows
              prefers-color-scheme the same way globals.css does; "light"/
              "dark" mirrors the user's explicit choice above so toasts don't
              look inconsistent with the rest of the UI. */}
          <Toaster theme={theme} richColors closeButton />
        </NextIntlClientProvider>
      </body>
      {/* Self-hosted installs have no relationship to the Guidon Cloud GA
          property - only load it when this is actually Guidon Cloud, same
          gating src/app/page.tsx already uses for cloud-only pricing. */}
      {!hasDirectDatabase() && <GoogleAnalytics gaId={GA_MEASUREMENT_ID} />}
    </html>
  );
}
