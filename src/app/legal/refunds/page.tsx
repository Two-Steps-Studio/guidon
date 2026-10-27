import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { refundsCopy } from "@/lib/legal-copy";
import { legalRobots } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Refund Policy",
  alternates: { canonical: "/legal/refunds" },
  robots: legalRobots,
};

export default function RefundsPage() {
  return <LegalDocument copy={refundsCopy} />;
}
