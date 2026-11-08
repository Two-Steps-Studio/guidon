import type { Metadata } from "next";
import { publicOpenGraph } from "@/lib/public-open-graph";
import { LegalDocument } from "@/components/legal/legal-document";
import { privacyCopy } from "@/lib/legal-copy";
import { legalRobots } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy and Data Rights",
  description: "Learn what data Guidon Cloud collects, how it is used and how to exercise your privacy rights.",
  alternates: { canonical: "/legal/privacy" },
  openGraph: publicOpenGraph("/legal/privacy"),
  robots: legalRobots,
};

export default function PrivacyPage() {
  return <LegalDocument copy={privacyCopy} />;
}
