import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import { hasDirectDatabase } from "@/lib/db/pool";
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

export const metadata: Metadata = {
  title: "Guidon - Context-First Project Management",
  description: "Understand why your project exists. Context-first project management for development teams.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <body className="min-h-screen bg-background text-foreground">
        {children}
      </body>
      {/* Self-hosted installs have no relationship to the Guidon Cloud GA
          property - only load it when this is actually Guidon Cloud, same
          gating src/app/page.tsx already uses for cloud-only pricing. */}
      {!hasDirectDatabase() && <GoogleAnalytics gaId={GA_MEASUREMENT_ID} />}
    </html>
  );
}
