import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { termsCopy } from "@/lib/legal-copy";
import { legalRobots } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms of Service",
  alternates: { canonical: "/legal/terms" },
  robots: legalRobots,
};

export default function TermsPage() {
  return <LegalDocument copy={termsCopy} />;
}
