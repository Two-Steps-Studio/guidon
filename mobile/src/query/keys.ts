/** React Query keys - every cache entry the app reads or writes. */
export const queryKeys = {
  projects: () => ["projects"] as const,
  columns: (projectId: string) => ["project", projectId, "columns"] as const,
  priorities: (projectId: string) => ["project", projectId, "priorities"] as const,
  tasks: (projectId: string) => ["project", projectId, "tasks"] as const,
  task: (taskId: string) => ["task", taskId] as const,
  comments: (taskId: string) => ["task", taskId, "comments"] as const,
};

/**
 * Mutation keys. Each has defaults (mutationFn + optimistic handlers)
 * registered in mutations.ts, so a change paused offline and persisted can
 * be resumed after the app restarts - the persisted mutation only carries
 * its key and variables.
 */
export const mutationKeys = {
  setStatus: ["task", "setStatus"] as const,
  updateTask: ["task", "update"] as const,
  createTask: ["task", "create"] as const,
  addComment: ["comment", "create"] as const,
};

/** All writes share one scope so they reach the server in the order they were made. */
export const WRITE_SCOPE = { id: "guidon-writes" };
