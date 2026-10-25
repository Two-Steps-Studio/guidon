import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { cookiesCopy } from "@/lib/legal-copy";
import { legalRobots } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Cookie and Browser Storage Notice",
  alternates: { canonical: "/legal/cookies" },
  robots: legalRobots,
};

export default function CookiesPage() {
  return <LegalDocument copy={cookiesCopy} />;
}
