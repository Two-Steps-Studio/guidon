import { AlertTriangle, CheckCircle2, Clock, type LucideIcon } from "lucide-react";
import type { PhaseStatus } from "@/types/task";

export const STATUS_CONFIG: Record<PhaseStatus, { label: string; color: string; icon: LucideIcon }> = {
  planned: { label: "Planned", color: "bg-info/10 text-info", icon: Clock },
  in_progress: { label: "In Progress", color: "bg-warning/10 text-warning", icon: AlertTriangle },
  completed: { label: "Completed", color: "bg-success/10 text-success", icon: CheckCircle2 },
  blocked: { label: "Blocked", color: "bg-danger/10 text-danger", icon: AlertTriangle },
};
