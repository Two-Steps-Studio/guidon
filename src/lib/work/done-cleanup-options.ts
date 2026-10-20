/** The periods offered for "delete finished tasks after N days" (migration 061 allows 1-3650). */
export const DONE_CLEANUP_OPTIONS = [7, 14, 30, 60, 90, 180, 365] as const;
