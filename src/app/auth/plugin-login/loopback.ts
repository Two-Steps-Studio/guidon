/**
 * Restricts the plugin-login redirect target to a loopback address
 * (127.0.0.1/localhost) - this is what a local editor plugin's own
 * temporary HTTP listener binds to (see the Unity plugin's
 * GuidonBrowserAuth.cs). Without this check, a crafted link with an
 * attacker-controlled redirect_uri could get an unsuspecting logged-in
 * user to click "Authorize" on the real Guidon site and have their freshly
 * issued API key sent straight to that attacker's server instead of their
 * own machine. Checked both on the page (to decide what to render) and
 * again in the Server Action that actually redirects (the real point of
 * enforcement - a page render alone blocks nothing).
 */
export function isSafeLoopbackRedirect(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}
