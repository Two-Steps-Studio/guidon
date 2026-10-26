// No imports: loaded by tests/api-route.test.mjs with Node's type stripping.

/** Most operations one POST /api/v1/batch may carry. */
export const MAX_BATCH_OPERATIONS = 20;

export const BATCH_METHODS = ["GET", "POST", "PATCH", "DELETE"] as const;
export type BatchMethod = (typeof BATCH_METHODS)[number];

export interface BatchOperation {
  method: BatchMethod;
  /** A v1 path relative to /api/v1, e.g. "/tasks/<id>/status". */
  path: string;
  body?: unknown;
}

/**
 * Validates the request body: `{ operations: [{ method, path, body? }] }`.
 * Returns the operations or a message saying what's wrong.
 */
export function parseBatch(body: unknown): { operations: BatchOperation[] } | { error: string } {
  if (!body || typeof body !== "object" || !Array.isArray((body as { operations?: unknown }).operations)) {
    return { error: "Body must be { \"operations\": [{ \"method\", \"path\", \"body\"? }] }." };
  }
  const raw = (body as { operations: unknown[] }).operations;
  if (raw.length === 0) return { error: "operations is empty." };
  if (raw.length > MAX_BATCH_OPERATIONS) return { error: `At most ${MAX_BATCH_OPERATIONS} operations per batch.` };
  const operations: BatchOperation[] = [];
  for (const [index, item] of raw.entries()) {
    if (!item || typeof item !== "object") return { error: `operations[${index}] must be an object.` };
    const { method, path, body: opBody } = item as { method?: unknown; path?: unknown; body?: unknown };
    if (typeof method !== "string" || !(BATCH_METHODS as readonly string[]).includes(method.toUpperCase())) {
      return { error: `operations[${index}].method must be one of ${BATCH_METHODS.join(", ")}.` };
    }
    if (typeof path !== "string" || !path.startsWith("/") || path.includes("..") || path.length > 300) {
      return { error: `operations[${index}].path must be an API path like /tasks/{taskId}.` };
    }
    if (/^\/batch(\/|\?|$)/.test(path)) return { error: `operations[${index}]: a batch can't contain another batch.` };
    operations.push({ method: method.toUpperCase() as BatchMethod, path, ...(opBody === undefined ? {} : { body: opBody }) });
  }
  return { operations };
}

const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

/** v1 path patterns a batch can reach, with the route params they carry. */
export const BATCH_ROUTES: ReadonlyArray<{ key: string; pattern: RegExp; params: string[] }> = [
  { key: "projects", pattern: new RegExp(`^/projects$`), params: [] },
  { key: "projectTasks", pattern: new RegExp(`^/projects/(${UUID})/tasks$`), params: ["projectId"] },
  { key: "projectColumns", pattern: new RegExp(`^/projects/(${UUID})/columns$`), params: ["projectId"] },
  { key: "projectPriorities", pattern: new RegExp(`^/projects/(${UUID})/priorities$`), params: ["projectId"] },
  { key: "projectEvents", pattern: new RegExp(`^/projects/(${UUID})/events$`), params: ["projectId"] },
  { key: "projectResource", pattern: new RegExp(`^/projects/(${UUID})/([a-z]+)$`), params: ["projectId", "resource"] },
  { key: "projectResourceItem", pattern: new RegExp(`^/projects/(${UUID})/([a-z]+)/(${UUID})$`), params: ["projectId", "resource", "itemId"] },
  { key: "task", pattern: new RegExp(`^/tasks/(${UUID})$`), params: ["taskId"] },
  { key: "taskAction", pattern: new RegExp(`^/tasks/(${UUID})/(context|start|status|complete|comment|attempts)$`), params: ["taskId", "action"] },
];

/** Which route a path is, and its params - null when a batch can't reach it. */
export function matchBatchRoute(path: string): { key: string; params: Record<string, string> } | null {
  const pathname = path.split("?")[0];
  for (const route of BATCH_ROUTES) {
    const match = route.pattern.exec(pathname);
    if (match) return { key: route.key, params: Object.fromEntries(route.params.map((name, i) => [name, match[i + 1]])) };
  }
  return null;
}
