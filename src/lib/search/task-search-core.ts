/**
 * Ranking for task search (/api/v1/search, the ⌘K palette). Pure, so it is
 * tested on its own (`npm run test:search`) and runs the same whether the
 * rows came from Postgres or Supabase. The database only supplies
 * candidates - RLS decides which tasks those can be - and this decides the
 * order:
 *
 *   task id / guidon#ref > exact title > title prefix > title contains >
 *   every query word starts a title word > description > typo-tolerant title
 *
 * Text is compared lowercased and without diacritics ("zolty" finds "Żółty",
 * "uberprufen" finds "Überprüfen"), ties go to the most recently updated.
 */

export type TaskMatch = "id" | "exact" | "prefix" | "contains" | "words" | "description" | "fuzzy";

export interface SearchableTask {
  id: string;
  title: string;
  description?: string | null;
  updated_at?: string | Date | null;
}

export interface RankedTask<T extends SearchableTask> {
  task: T;
  score: number;
  match: TaskMatch;
}

/** Lowercase, no diacritics, single spaces: the form every comparison uses. */
export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/ł/g, "l")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function words(value: string): string[] {
  return value.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/**
 * The hex a task reference starts with, when the query is one: a full or
 * partial UUID (at least 6 hex characters, dashes allowed) or `guidon#xxxx`
 * as written in commits. Null for ordinary text.
 */
export function taskRefPrefix(query: string): string | null {
  const match = /^(guidon#)?([0-9a-f-]{6,36})$/i.exec(query.trim());
  if (!match) return null;
  const hex = match[2].replace(/-/g, "").toLowerCase();
  // "facade" or "decade" are words, not references: require a digit.
  return hex.length >= 6 && hex.length <= 32 && (match[1] || /\d/.test(hex)) ? hex : null;
}

/** Inclusive UUID bounds use the primary-key index, without casting UUIDs to text. */
export function taskRefBounds(query: string): { lower: string; upper: string } | null {
  const prefix = taskRefPrefix(query);
  if (!prefix) return null;
  const uuid = (hex: string) => `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  return { lower: uuid(prefix.padEnd(32, "0")), upper: uuid(prefix.padEnd(32, "f")) };
}

/** Edit distance with adjacent swaps, giving up (returning max + 1) past `max`. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows: number[][] = [Array.from({ length: b.length + 1 }, (_, index) => index)];
  for (let i = 1; i <= a.length; i++) {
    rows[i] = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, rows[i - 2][j - 2] + 1);
      rows[i][j] = value;
      best = Math.min(best, value);
    }
    if (best > max) return max + 1;
  }
  return rows[a.length][b.length];
}

// Short words allow one mistake, longer ones two; under 3 letters none.
function allowedTypos(word: string): number {
  return word.length < 3 ? 0 : word.length <= 5 ? 1 : 2;
}

/** A query word matches a title word exactly, as its start, or with a typo (whole word or same-length start). */
function fuzzyWordMatch(queryWord: string, titleWords: string[]): boolean {
  const typos = allowedTypos(queryWord);
  return titleWords.some((word) => {
    if (word.startsWith(queryWord)) return true;
    if (typos === 0) return false;
    if (editDistance(queryWord, word, typos) <= typos) return true;
    // "zadan" for "zadanie", typed with a mistake: compare against the start.
    return word.length > queryWord.length && editDistance(queryWord, word.slice(0, queryWord.length), typos) <= typos;
  });
}

export function scoreTask(query: string, task: SearchableTask): { score: number; match: TaskMatch } | null {
  const ref = taskRefPrefix(query);
  if (ref && task.id.replace(/-/g, "").toLowerCase().startsWith(ref)) return { score: 1000, match: "id" };

  const q = normalizeText(query);
  if (!q) return null;
  const title = normalizeText(task.title);
  if (title === q) return { score: 900, match: "exact" };
  if (title.startsWith(q)) return { score: 800, match: "prefix" };
  const index = title.indexOf(q);
  // A match at a word start ranks above one inside a word.
  if (index >= 0) return { score: index === 0 || title[index - 1] === " " ? 720 : 700, match: "contains" };

  const queryWords = words(q);
  const titleWords = words(title);
  if (queryWords.length > 1 && queryWords.every((word) => titleWords.some((titleWord) => titleWord.startsWith(word)))) {
    return { score: 600, match: "words" };
  }

  const description = task.description ? normalizeText(task.description) : "";
  if (description && (description.includes(q) || (queryWords.length > 1 && queryWords.every((word) => description.includes(word))))) {
    return { score: 400, match: "description" };
  }

  if (queryWords.length > 0 && queryWords.some((word) => word.length >= 3) && queryWords.every((word) => fuzzyWordMatch(word, titleWords))) {
    return { score: 200, match: "fuzzy" };
  }
  return null;
}

function time(value: SearchableTask["updated_at"]): number {
  return value ? new Date(value).getTime() || 0 : 0;
}

/** Best first; equal scores newest first. Tasks that don't match are left out. */
export function rankTasks<T extends SearchableTask>(query: string, tasks: readonly T[], limit = 10): RankedTask<T>[] {
  const seen = new Set<string>();
  const ranked: RankedTask<T>[] = [];
  for (const task of tasks) {
    if (seen.has(task.id)) continue;
    seen.add(task.id);
    const scored = scoreTask(query, task);
    if (scored) ranked.push({ task, ...scored });
  }
  return ranked.sort((a, b) => b.score - a.score || time(b.task.updated_at) - time(a.task.updated_at) || a.task.id.localeCompare(b.task.id)).slice(0, limit);
}

/** An ILIKE pattern that matches the text literally (% and _ are wildcards there). */
export function likePattern(query: string): string {
  return `%${query.trim().replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}
