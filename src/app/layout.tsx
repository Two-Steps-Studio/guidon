import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { hasDirectDatabase } from "@/lib/db/pool";
import { SITE_URL } from "@/lib/site-url";
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

  return (
    <html lang={locale} className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <body className="min-h-screen bg-background text-foreground">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <main>{children}</main>
        </NextIntlClientProvider>
      </body>
      {/* Self-hosted installs have no relationship to the Guidon Cloud GA
          property - only load it when this is actually Guidon Cloud, same
          gating src/app/page.tsx already uses for cloud-only pricing. */}
      {!hasDirectDatabase() && <GoogleAnalytics gaId={GA_MEASUREMENT_ID} />}
    </html>
  );
}
