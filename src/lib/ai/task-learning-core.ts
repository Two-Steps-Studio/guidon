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

// Words that say nothing about what a fact is about (English and Polish, the
// languages most project memory is written in here).
const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "into", "this", "that", "these", "those", "when", "then", "than", "must", "should",
  "always", "never", "only", "also", "every", "each", "about", "after", "before", "because", "project", "task", "tasks", "uses", "using",
  "oraz", "jest", "musi", "zawsze", "nigdy", "tylko", "przez", "jako", "kiedy", "gdy", "poniewaz", "projekt", "projektu",
]);

/** The words a fact is about: lowercase, without diacritics, 4+ letters, plural "s" dropped, no stopwords. */
export function factWords(text: string): Set<string> {
  return new Set(
    stripLearnedSuffix(text)
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/ł/g, "l")
      .split(/[^a-z]+/)
      .filter((word) => word.length >= 4 && !STOPWORDS.has(word))
      .map((word) => (word.length > 4 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word)),
  );
}

/** Numbers and versions in a fact ("150", "4.3"): two facts that differ in them are different facts. */
export function factNumbers(text: string): Set<string> {
  return new Set(stripLearnedSuffix(text).match(/\d+(?:\.\d+)*/g) ?? []);
}

// Learned entries end with `(fact, from "Task title")` - not part of the fact.
function stripLearnedSuffix(text: string): string {
  return text.replace(/\s*\((?:fact|project rule|constraint|decision summary), from "[^"]*"\)\s*$/i, "");
}

/**
 * Whether a proposed fact says what memory already says: most of its words
 * appear in one existing entry (containment >= 0.7), or the two share most
 * of their words (Jaccard >= 0.6). Short facts (under 3 words that count)
 * need an exact word match instead. Facts whose numbers differ ("Godot 4.3" /
 * "Godot 3.5", "under 150 MB" / "under 200 MB") are never merged.
 */
export function isNearDuplicate(content: string, existing: string[]): boolean {
  const words = factWords(content);
  if (words.size === 0) return true;
  const numbers = factNumbers(content);
  for (const other of existing) {
    const otherWords = factWords(other);
    if (otherWords.size === 0) continue;
    const otherNumbers = factNumbers(other);
    if (numbers.size && otherNumbers.size && [...numbers].some((n) => !otherNumbers.has(n))) continue;
    let shared = 0;
    for (const word of words) if (otherWords.has(word)) shared++;
    if (words.size < 3) {
      if (shared === words.size && otherWords.size === words.size) return true;
      continue;
    }
    const containment = shared / words.size;
    const jaccard = shared / (words.size + otherWords.size - shared);
    if (containment >= 0.7 || jaccard >= 0.6) return true;
  }
  return false;
}

/** The facts worth inserting: not already in memory and not repeating each other. */
export function newFacts(facts: LearnedFact[], existing: string[]): LearnedFact[] {
  const kept: LearnedFact[] = [];
  for (const fact of facts) {
    if (isNearDuplicate(fact.content, [...existing, ...kept.map((k) => k.content)])) continue;
    kept.push(fact);
  }
  return kept;
}
