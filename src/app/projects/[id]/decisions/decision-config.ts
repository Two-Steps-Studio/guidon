import { CheckCircle2, Clock, GitBranch, XCircle, type LucideIcon } from "lucide-react";
import type { Decision } from "@/types/context";

export const STATUS_CONFIG: Record<Decision["status"], { label: string; color: string; icon: LucideIcon }> = {
  proposed: { label: "Proposed", color: "bg-info/10 text-info", icon: Clock },
  approved: { label: "Approved", color: "bg-success/10 text-success", icon: CheckCircle2 },
  rejected: { label: "Rejected", color: "bg-danger/10 text-danger", icon: XCircle },
  deprecated: { label: "Deprecated", color: "bg-muted text-muted-foreground", icon: GitBranch },
};

export const TYPE_COLORS: Record<Decision["decision_type"], string> = {
  technical: "bg-info/10 text-info",
  architectural: "bg-primary/10 text-primary",
  product: "bg-success/10 text-success",
  business: "bg-warning/10 text-warning",
  process: "bg-danger/10 text-danger",
  other: "bg-muted text-muted-foreground",
};

export const TYPE_OPTIONS: { value: Decision["decision_type"]; label: string }[] = [
  { value: "technical", label: "Technical" },
  { value: "architectural", label: "Architectural" },
  { value: "product", label: "Product" },
  { value: "business", label: "Business" },
  { value: "process", label: "Process" },
  { value: "other", label: "Other" },
];
