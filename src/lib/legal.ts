import "server-only";
import { SUPPORT_EMAIL } from "@/lib/project-links";

export const LEGAL_VERSION = "2026-10-24";
// Public identification only. Never place IDs, credentials or private notes here.
export const legalOperator = {
  name: process.env.LEGAL_OPERATOR_NAME?.trim() ?? "",
  address: process.env.LEGAL_OPERATOR_ADDRESS?.trim() ?? "",
  phone: process.env.LEGAL_OPERATOR_PHONE?.trim() ?? "",
  email: process.env.LEGAL_OPERATOR_EMAIL?.trim() || SUPPORT_EMAIL,
  country: "Poland",
};
export const legalPublicationReady = process.env.LEGAL_DOCUMENTS_APPROVED === "true"
  && Boolean(legalOperator.name && legalOperator.address && legalOperator.phone);
export const legalRobots = { index: legalPublicationReady, follow: true };

export type LegalSection = { heading: string; paragraphs?: readonly string[]; items?: readonly string[] };
export type LegalCopy = { title: string; introduction: string; sections: readonly LegalSection[] };
