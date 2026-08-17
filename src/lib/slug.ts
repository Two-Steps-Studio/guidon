/**
 * Slug helpers.
 *
 * `projects.slug` is NOT NULL with a format CHECK of
 * `^[a-z0-9]+(-[a-z0-9]+)*$` and a max length of 64, unique per organization.
 * Migration 004 also fills it in via a BEFORE INSERT trigger; generating it
 * here too means creation works whether or not that migration has been run,
 * and gives the caller a predictable value to display immediately.
 */

const MAX_SLUG_LENGTH = 64;
/** Leaves room for a `-NN` disambiguating suffix. */
const MAX_BASE_LENGTH = 60;

export function slugify(value: string, fallback = "project"): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || fallback;
}

/**
 * Produce a slug from `value` that is not present in `taken`, appending a
 * numeric suffix when needed. Mirrors private.next_project_slug() in 004.
 */
export function uniqueSlug(
  value: string,
  taken: Iterable<string>,
  fallback = "project"
): string {
  const takenSet = new Set(
    Array.from(taken, (entry) => entry.toLowerCase())
  );

  const base =
    slugify(value, fallback).slice(0, MAX_BASE_LENGTH).replace(/-+$/, "") ||
    fallback;

  if (!takenSet.has(base)) return base;

  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!takenSet.has(candidate) && candidate.length <= MAX_SLUG_LENGTH) {
      return candidate;
    }
  }

  // Practically unreachable; keeps the return type honest.
  return `${base}-${Date.now().toString(36)}`.slice(0, MAX_SLUG_LENGTH);
}

/** True when a value already satisfies the projects.slug CHECK constraint. */
export function isValidSlug(value: string): boolean {
  return (
    value.length >= 1 &&
    value.length <= MAX_SLUG_LENGTH &&
    /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value)
  );
}
