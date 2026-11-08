import type { Metadata } from "next";
import { publicOpenGraph } from "@/lib/public-open-graph";
import { LegalDocument } from "@/components/legal/legal-document";
import { termsCopy } from "@/lib/legal-copy";
import { legalRobots } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms of Service for Guidon Cloud",
  description: "Read the terms for using Guidon Cloud, including accounts, project content and acceptable use.",
  alternates: { canonical: "/legal/terms" },
  openGraph: publicOpenGraph("/legal/terms"),
  robots: legalRobots,
};

export default function TermsPage() {
  return <LegalDocument copy={termsCopy} />;
}
