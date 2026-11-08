import type { Metadata } from "next";
import { publicOpenGraph } from "@/lib/public-open-graph";
import { LegalDocument } from "@/components/legal/legal-document";
import { refundsCopy } from "@/lib/legal-copy";
import { legalRobots } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Refund Policy for Guidon Cloud",
  description: "Learn when refunds are available for Guidon Cloud subscriptions and how to submit a request.",
  alternates: { canonical: "/legal/refunds" },
  openGraph: publicOpenGraph("/legal/refunds"),
  robots: legalRobots,
};

export default function RefundsPage() {
  return <LegalDocument copy={refundsCopy} />;
}
