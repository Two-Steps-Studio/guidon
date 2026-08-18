import { AlertTriangle, BookOpen, CheckCircle2, Clock, FileText, Lightbulb, type LucideIcon } from "lucide-react";
import type { MemoryType } from "@/types/context";

export const MEMORY_TYPE_CONFIG: Record<MemoryType, { label: string; color: string; icon: LucideIcon }> = {
  fact: { label: "Fact", color: "bg-blue-100 text-blue-800", icon: FileText },
  project_rule: { label: "Rule", color: "bg-purple-100 text-purple-800", icon: CheckCircle2 },
  constraint: { label: "Constraint", color: "bg-red-100 text-red-800", icon: AlertTriangle },
  preference: { label: "Preference", color: "bg-green-100 text-green-800", icon: Clock },
  decision_summary: { label: "Decision", color: "bg-yellow-100 text-yellow-800", icon: FileText },
  observation: { label: "Observation", color: "bg-gray-100 text-gray-800", icon: BookOpen },
  ai_insight: { label: "AI Insight", color: "bg-indigo-100 text-indigo-800", icon: Lightbulb },
};
