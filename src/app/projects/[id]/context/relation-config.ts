import type { ContextEntityType, RelationType } from "@/types/context";

export const ENTITY_TYPE_LABELS: Record<ContextEntityType, string> = {
  project: "Project",
  task: "Task",
  phase: "Roadmap phase",
  decision: "Decision",
  file: "File",
  source: "Source",
  memory: "Memory",
};

export const ENTITY_TYPE_OPTIONS: ContextEntityType[] = [
  "task",
  "decision",
  "phase",
  "source",
  "file",
  "memory",
  "project",
];

export const RELATION_TYPE_LABELS: Record<RelationType, string> = {
  depends_on: "Depends on",
  blocks: "Blocks",
  implements: "Implements",
  references: "References",
  decided_by: "Decided by",
  based_on: "Based on",
  related_to: "Related to",
  contradicts: "Contradicts",
  supersedes: "Supersedes",
  part_of: "Part of",
  contains: "Contains",
};

export const RELATION_TYPE_OPTIONS: RelationType[] = [
  "depends_on",
  "blocks",
  "implements",
  "references",
  "decided_by",
  "based_on",
  "related_to",
  "contradicts",
  "supersedes",
  "part_of",
  "contains",
];
