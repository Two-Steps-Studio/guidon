import { CheckCircle2, Clock, GitBranch, XCircle, type LucideIcon } from "lucide-react";
import type { Decision } from "@/types/context";

export const STATUS_CONFIG: Record<Decision["status"], { label: string; color: string; icon: LucideIcon }> = {
  proposed: { label: "Proposed", color: "bg-blue-100 text-blue-800", icon: Clock },
  approved: { label: "Approved", color: "bg-green-100 text-green-800", icon: CheckCircle2 },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-800", icon: XCircle },
  deprecated: { label: "Deprecated", color: "bg-yellow-100 text-yellow-800", icon: GitBranch },
};

export const TYPE_COLORS: Record<Decision["decision_type"], string> = {
  technical: "bg-purple-100 text-purple-800",
  architectural: "bg-indigo-100 text-indigo-800",
  product: "bg-pink-100 text-pink-800",
  business: "bg-orange-100 text-orange-800",
  process: "bg-teal-100 text-teal-800",
  other: "bg-gray-100 text-gray-800",
};

export const TYPE_OPTIONS: { value: Decision["decision_type"]; label: string }[] = [
  { value: "technical", label: "Technical" },
  { value: "architectural", label: "Architectural" },
  { value: "product", label: "Product" },
  { value: "business", label: "Business" },
  { value: "process", label: "Process" },
  { value: "other", label: "Other" },
];
