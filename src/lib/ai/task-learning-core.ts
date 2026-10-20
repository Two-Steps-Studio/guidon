// No imports: loaded by tests/ai/task-learning.test.mjs with Node's type stripping.

/** What task-learning.ts asks the model for. */
export const LEARNED_TYPES = ["fact", "project_rule", "constraint", "decision_summary"] as const;
export type LearnedType = (typeof LEARNED_TYPES)[number];

export interface LearnedFact {
  type: LearnedType;
  content: string;
}

export interface TaskMaterial {
  title: string;
  description: string;
  comments: string[];
  attempts: string[];
}

/**
 * Only tasks someone wrote something about are worth an AI call: a bare
 * "Fix typo" card teaches the project nothing. Any recorded attempt counts
 * (it says what was tried and why), otherwise enough description/comments.
 */
export function taskHasSubstance(task: TaskMaterial, minChars = 160): boolean {
  if (task.attempts.length > 0) return true;
  const written = task.description.trim().length + task.comments.reduce((sum, c) => sum + c.trim().length, 0);
  return written >= minChars;
}

/**
 * The model's answer -> at most two well-formed facts. Tolerates prose or a
 * ```json fence around the array; anything malformed is dropped, never thrown.
 */
export function parseLearnedFacts(text: string, max = 2): LearnedFact[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: LearnedFact[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const { type, content } = item as Record<string, unknown>;
    if (typeof content !== "string" || content.trim().length < 12) continue;
    out.push({
      type: (LEARNED_TYPES as readonly string[]).includes(type as string) ? (type as LearnedType) : "fact",
      content: content.trim().slice(0, 600),
    });
    if (out.length === max) break;
  }
  return out;
}
