import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { privacyCopy } from "@/lib/legal-copy";
import { legalRobots } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy",
  alternates: { canonical: "/legal/privacy" },
  robots: legalRobots,
};

export default function PrivacyPage() {
  return <LegalDocument copy={privacyCopy} />;
}
