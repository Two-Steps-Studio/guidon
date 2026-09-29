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

/** Two-letter avatar initials from the full name, or from the email's parts when there is none. */
export function initialsFor(person: PersonLike): string {
  const source = person.full_name?.trim() || person.email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);

  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return (parts[0][0] + parts[1][0]).toUpperCase();
}
