import { AlertTriangle, BookOpen, CheckCircle2, Clock, FileText, Lightbulb, type LucideIcon } from "lucide-react";
import type { MemoryType } from "@/types/context";

export const MEMORY_TYPE_CONFIG: Record<MemoryType, { label: string; color: string; icon: LucideIcon }> = {
  fact: { label: "Fact", color: "bg-primary/10 text-primary", icon: FileText },
  project_rule: { label: "Rule", color: "bg-warning/10 text-warning", icon: CheckCircle2 },
  constraint: { label: "Constraint", color: "bg-danger/10 text-danger", icon: AlertTriangle },
  preference: { label: "Preference", color: "bg-success/10 text-success", icon: Clock },
  decision_summary: { label: "Decision", color: "bg-muted text-muted-foreground", icon: FileText },
  observation: { label: "Observation", color: "bg-muted text-muted-foreground", icon: BookOpen },
  // Matches the AI == blue/text-info convention used for AI activity log
  // entries (src/app/projects/[id]/activity/action-config.ts).
  ai_insight: { label: "AI Insight", color: "bg-info/10 text-info", icon: Lightbulb },
};
