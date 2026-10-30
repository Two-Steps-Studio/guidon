/**
 * Display helpers for a person (profile/member). Pure - safe in server and
 * client components alike.
 */

export interface PersonLike {
  full_name?: string | null;
  email: string;
}

/** Full name when set, otherwise the email; `fallback` for an unknown/deleted profile. */
export function displayName(person: PersonLike | null | undefined, fallback: string): string {
  if (!person) return fallback;
  return person.full_name || person.email;
}

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const graphemes = (text: string) => Array.from(segmenter.segment(text), ({ segment }) => segment);

/** Two-letter avatar initials from the full name, or from the email's parts when there is none. */
export function initialsFor(person: Partial<PersonLike>): string {
  const name = person.full_name?.trim();
  const source = name || person.email?.split("@")[0] || "";
  const parts = source.split(name ? /\s+/ : /[._-]+/).filter(Boolean);
  // Generational suffixes are not the person's surname.
  while (parts.length > 2 && /^(?:jr\.?|sr\.?|ii|iii|iv|v)$/i.test(parts.at(-1)!)) parts.pop();

  if (parts.length === 0) return "?";
  if (parts.length === 1) return graphemes(parts[0]).slice(0, 2).join("").toUpperCase();

  return (graphemes(parts[0])[0] + graphemes(parts.at(-1)!)[0]).toUpperCase();
}
