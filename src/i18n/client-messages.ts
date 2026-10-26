// No imports: loaded by tests/client-messages.test.mjs with Node's type stripping.

/**
 * Translations the browser gets on pages outside the app shell - the
 * landing page, legal and developer pages, sign-in, onboarding. Before,
 * every page carried the whole catalog (~90 KB of JSON inline in the
 * HTML, half the landing page's size), though those pages render almost
 * everything on the server. App pages (AppShell, /mini) add the full
 * catalog back with <AppMessages> (src/components/layout/app-messages.tsx).
 *
 * A client component used outside the app shell must find its namespace
 * here - test:agent-web checks the files it knows about.
 */
export const PUBLIC_CLIENT_NAMESPACES = [
  "common",
  "auth",
  "landing",
  "onboarding",
  "errors",
  "datePicker",
  // The accept button on /invite/<token> (outside the app shell).
  "invitation",
  // The template names on /start's workflow step.
  "settings.labelStarter",
] as const;

type Messages = Record<string, unknown>;

/** The parts of `messages` at the given dotted paths, nested as in the original. */
export function pickMessages(messages: Messages, paths: readonly string[]): Messages {
  const out: Messages = {};
  for (const path of paths) {
    const keys = path.split(".");
    let source: unknown = messages;
    for (const key of keys) source = source && typeof source === "object" ? (source as Messages)[key] : undefined;
    if (source === undefined) continue;
    let target = out;
    keys.slice(0, -1).forEach((key) => {
      target[key] = target[key] && typeof target[key] === "object" ? target[key] : {};
      target = target[key] as Messages;
    });
    target[keys[keys.length - 1]] = source;
  }
  return out;
}
