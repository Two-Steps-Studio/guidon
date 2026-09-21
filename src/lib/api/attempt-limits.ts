/**
 * Size bounds for POST /api/v1/tasks/[taskId]/attempts. Pure data so the route
 * (enforcement) and the MCP `record_attempt` schema (early, clearer errors)
 * share one definition.
 */
export const ATTEMPT_TEXT_MAX = 10_000;
export const ATTEMPT_PR_URL_MAX = 2_048;
export const ATTEMPT_FILES_MAX = 200;
export const ATTEMPT_FILE_PATH_MAX = 500;
