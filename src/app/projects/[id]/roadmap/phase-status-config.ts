import { AlertTriangle, CheckCircle2, Clock, type LucideIcon } from "lucide-react";
import type { PhaseStatus } from "@/types/task";

export const STATUS_CONFIG: Record<PhaseStatus, { label: string; color: string; icon: LucideIcon }> = {
  planned: { label: "Planned", color: "bg-blue-100 text-blue-800", icon: Clock },
  in_progress: { label: "In Progress", color: "bg-yellow-100 text-yellow-800", icon: AlertTriangle },
  completed: { label: "Completed", color: "bg-green-100 text-green-800", icon: CheckCircle2 },
  blocked: { label: "Blocked", color: "bg-red-100 text-red-800", icon: AlertTriangle },
};
