import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { AnalyticsChoiceReset } from "@/components/layout/analytics-consent";
import { cookiesCopy } from "@/lib/legal-copy";
import { legalRobots } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Cookie and Browser Storage Notice",
  alternates: { canonical: "/legal/cookies" },
  robots: legalRobots,
};

export default function CookiesPage() {
  return <LegalDocument copy={cookiesCopy}><div className="mt-8"><AnalyticsChoiceReset /></div></LegalDocument>;
}
