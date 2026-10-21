/**
 * guidon://auth?code=...&state=... is the sign-in redirect. It's consumed by
 * WebBrowser.openAuthSessionAsync (auth/session.tsx), not a screen - on
 * Android the same URL also reaches the router as a deep link, which would
 * otherwise land on an unmatched route. Swallow it here.
 */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string {
  try {
    if (isAuthRedirect(path)) return initial ? "/" : "";
    return path;
  } catch {
    return initial ? "/" : path;
  }
}

function isAuthRedirect(path: string): boolean {
  // Either the full URL (guidon://auth?...) or a bare path (/auth?..., auth?...).
  if (/^guidon:\/\/auth(?:[/?#]|$)/i.test(path)) return true;
  return /^\/?(?:--\/)?auth(?:[/?#]|$)/i.test(path);
}
