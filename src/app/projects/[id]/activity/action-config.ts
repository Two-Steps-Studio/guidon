import {
  Activity,
  FileText,
  FolderKanban,
  GitBranch,
  Layers,
  Link2,
  Scale,
  Trash2,
  UserCog,
  UserMinus,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import type { ActivityAction } from "@/types/api";

interface ActionConfig {
  label: string;
  icon: LucideIcon;
  color: string;
}

/**
 * Icon + label per action type, keyed by the ActivityAction vocabulary
 * already defined in src/types/api.ts (written for the dead /api/v1 routes —
 * see docs/self-hosting-audit.md §1 — but not enforced by any CHECK
 * constraint on activity_logs.action, which is plain text). Nothing in this
 * codebase writes activity_logs rows today, so this map has never been
 * exercised against real data; ACTION_FALLBACK below covers any value that
 * doesn't match, so a future producer using a different vocabulary still
 * renders instead of crashing.
 */
export const ACTION_CONFIG: Record<ActivityAction, ActionConfig> = {
  project_created: { label: "Project created", icon: FolderKanban, color: "text-success" },
  project_updated: { label: "Project updated", icon: FolderKanban, color: "text-primary" },
  project_archived: { label: "Project archived", icon: FolderKanban, color: "text-muted-foreground" },
  project_deleted: { label: "Project deleted", icon: Trash2, color: "text-destructive" },
  task_created: { label: "Task created", icon: Layers, color: "text-success" },
  task_updated: { label: "Task updated", icon: Layers, color: "text-primary" },
  task_deleted: { label: "Task deleted", icon: Trash2, color: "text-destructive" },
  task_status_changed: { label: "Task status changed", icon: Layers, color: "text-primary" },
  phase_created: { label: "Phase created", icon: GitBranch, color: "text-success" },
  phase_updated: { label: "Phase updated", icon: GitBranch, color: "text-primary" },
  phase_deleted: { label: "Phase deleted", icon: Trash2, color: "text-destructive" },
  decision_created: { label: "Decision created", icon: Scale, color: "text-success" },
  decision_updated: { label: "Decision updated", icon: Scale, color: "text-primary" },
  decision_approved: { label: "Decision approved", icon: Scale, color: "text-success" },
  decision_rejected: { label: "Decision rejected", icon: Scale, color: "text-destructive" },
  relation_created: { label: "Relation created", icon: Link2, color: "text-success" },
  relation_deleted: { label: "Relation deleted", icon: Link2, color: "text-destructive" },
  source_created: { label: "Source added", icon: FileText, color: "text-success" },
  source_updated: { label: "Source updated", icon: FileText, color: "text-primary" },
  memory_created: { label: "Memory created", icon: FileText, color: "text-success" },
  memory_updated: { label: "Memory updated", icon: FileText, color: "text-primary" },
  memory_verified: { label: "Memory verified", icon: FileText, color: "text-success" },
  file_uploaded: { label: "File uploaded", icon: FileText, color: "text-success" },
  file_deleted: { label: "File deleted", icon: Trash2, color: "text-destructive" },
  member_added: { label: "Member added", icon: UserPlus, color: "text-success" },
  member_removed: { label: "Member removed", icon: UserMinus, color: "text-destructive" },
  member_role_changed: { label: "Member role changed", icon: UserCog, color: "text-primary" },
  invite_sent: { label: "Invite sent", icon: UserPlus, color: "text-primary" },
  invite_accepted: { label: "Invite accepted", icon: UserPlus, color: "text-success" },
  invite_rejected: { label: "Invite rejected", icon: UserMinus, color: "text-destructive" },
};

const ACTION_FALLBACK: ActionConfig = {
  label: "Activity",
  icon: Activity,
  color: "text-muted-foreground",
};

/** Formats an unrecognised action string ("foo_bar" -> "Foo bar") rather than showing the raw code. */
function humanize(action: string): string {
  const spaced = action.replace(/_/g, " ").trim();
  if (!spaced) return ACTION_FALLBACK.label;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function configFor(action: string): ActionConfig {
  const known = ACTION_CONFIG[action as ActivityAction];
  if (known) return known;
  return { ...ACTION_FALLBACK, label: humanize(action) };
}
