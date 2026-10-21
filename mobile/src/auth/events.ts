/**
 * Decouples "the server said 401" (seen by the query cache, outside React)
 * from the session provider that signs the person out.
 */

type Listener = () => void;
const listeners = new Set<Listener>();

export function onUnauthorized(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitUnauthorized(): void {
  listeners.forEach((listener) => listener());
}

type SelfIdListener = (userId: string) => void;
const selfIdListeners = new Set<SelfIdListener>();

export function onSelfUserId(listener: SelfIdListener): () => void {
  selfIdListeners.add(listener);
  return () => {
    selfIdListeners.delete(listener);
  };
}

/**
 * The API never says who "me" is, but rows the app itself creates carry the
 * key owner's id (tasks.created_by, task_comments.author_id). Used only to
 * show "you" on cards and comments.
 */
export function emitSelfUserId(userId: string): void {
  if (!userId || userId === knownSelfUserId) return;
  knownSelfUserId = userId;
  selfIdListeners.forEach((listener) => listener(userId));
}

let knownSelfUserId: string | null = null;

/** Set by the session provider (from storage) so optimistic rows can carry "me". */
export function setKnownSelfUserId(userId: string | null): void {
  knownSelfUserId = userId;
}

export function getKnownSelfUserId(): string | null {
  return knownSelfUserId;
}
