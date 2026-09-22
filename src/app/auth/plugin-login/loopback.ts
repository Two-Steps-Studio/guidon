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

/**
 * Which editor plugin is logging in, from the `client` query param. Each
 * gets its own API key name so logging into one plugin doesn't revoke
 * another's key (authorizePluginLogin revokes the previous key *by name*).
 * Anything unknown or missing falls back to Unity - the Unity plugin
 * predates this param and never sends it.
 */
const PLUGIN_CLIENTS = {
  unity: { keyName: "Unity Plugin", label: "Unity" },
  unreal: { keyName: "Unreal Plugin", label: "Unreal Engine" },
  blender: { keyName: "Blender Plugin", label: "Blender" },
} as const;

export type PluginClient = keyof typeof PLUGIN_CLIENTS;

export function resolvePluginClient(value: string | undefined): PluginClient {
  return value && Object.hasOwn(PLUGIN_CLIENTS, value) ? (value as PluginClient) : "unity";
}

export function pluginKeyName(client: PluginClient): string {
  return PLUGIN_CLIENTS[client].keyName;
}

export function pluginClientLabel(client: PluginClient): string {
  return PLUGIN_CLIENTS[client].label;
}
