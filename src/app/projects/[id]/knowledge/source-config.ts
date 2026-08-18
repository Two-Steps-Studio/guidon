import type { SourceType } from "@/types/context";

/**
 * The knowledge layer is deliberately built on context_sources rather than a
 * new documents table: a source already carries a title, body, url and author,
 * and is already reachable from the project graph via context_relations. When
 * a richer editor arrives it can upgrade these rows in place.
 *
 * Only these four are offered for authoring — comment/commit/pull_request/
 * issue are populated by future integrations (GitHub, etc.), not typed by hand.
 */
export const AUTHORABLE_TYPES: { value: SourceType; label: string; hint: string }[] = [
  { value: "document", label: "Document", hint: "Specs, design docs, onboarding notes" },
  { value: "meeting", label: "Meeting note", hint: "What was discussed and agreed" },
  { value: "external_url", label: "Link", hint: "Reference material living elsewhere" },
  { value: "other", label: "Note", hint: "Anything else worth remembering" },
];

export const TYPE_LABELS: Record<SourceType, string> = {
  document: "Document",
  comment: "Comment",
  commit: "Commit",
  pull_request: "Pull request",
  issue: "Issue",
  external_url: "Link",
  meeting: "Meeting note",
  file: "File",
  other: "Note",
};
