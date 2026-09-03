/**
 * team/business plans have project_limit = NULL in `plans` (unlimited) -
 * organizations.project_limit itself is NOT NULL (migration 014), so
 * "unlimited" is represented as this sentinel rather than an actual NULL
 * in that column. Shared by actions.ts (which writes it) and
 * project-limit-editor.tsx (which needs to recognize and label it instead
 * of showing the raw integer) - kept in its own file, not actions.ts,
 * because a "use server" file may only export async functions; a plain
 * constant export there fails the Next.js build (not caught by
 * `tsc --noEmit`, only by `next build` itself).
 */
export const ORG_PROJECT_LIMIT_UNLIMITED_SENTINEL = 2147483647;
