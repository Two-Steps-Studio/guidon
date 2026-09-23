"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/data/current-user";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withServiceRole } from "@/lib/db/session";
import { createServiceClient } from "@/lib/supabase-server";
import { generateApiKey, hashApiKey, keyPrefix } from "@/lib/api/api-keys";
import type { ApiKeyScope } from "@/lib/api/scopes";
import { isSafeLoopbackRedirect, pluginKeyName, resolvePluginClient } from "./loopback";

const PLUGIN_KEY_SCOPES: ApiKeyScope[] = ["tasks:read", "tasks:write", "tasks:status", "comments:write"];

/**
 * The "Authorize" button on /auth/plugin-login. Runs as the already
 * signed-in browser session (this page requires one - see page.tsx), so no
 * password re-entry happens here; this only issues a key for the account
 * that's already logged into this browser.
 *
 * Same key-issuance shape as createApiKey (src/app/profile/api-keys-actions.ts):
 * revoke any previous key of this plugin's name ("Unity Plugin",
 * "Unreal Plugin", "Blender Plugin", "JetBrains Plugin", "Godot Plugin" - see
 * pluginKeyName) for this user first (api_keys only
 * stores a hash, so an old raw key could never be reused anyway - this just
 * keeps Profile > API Keys from accumulating dead entries), then insert a
 * fresh one and hand it to the waiting local listener via a redirect.
 *
 * The key is marked human_client (migration 039): the plugin is operated by
 * the signed-in person, so the API's AI-agent gates do not apply to it. Only
 * the server may set that column (INSERT is column-restricted for
 * `authenticated`), hence the service role below - scoped strictly to the
 * user id resolved from the verified session above, never from input.
 *
 * redirectUri is re-validated here (not just on the page) since this is the
 * actual point where a key would leak if it weren't loopback-only - a page
 * render alone enforces nothing.
 */
export async function authorizePluginLogin(redirectUri: string, state: string, client: string): Promise<void> {
  const keyName = pluginKeyName(resolvePluginClient(client));

  if (!isSafeLoopbackRedirect(redirectUri)) {
    throw new Error("Refusing to authorize a non-loopback redirect URI.");
  }

  const user = await getCurrentUser();

  const fullKey = generateApiKey();
  const hash = hashApiKey(fullKey);
  const prefix = keyPrefix(fullKey);

  if (hasDirectDatabase()) {
    await withServiceRole(async ({ query }) => {
      await query(
        "UPDATE api_keys SET revoked_at = now() WHERE user_id = $1 AND name = $2 AND revoked_at IS NULL",
        [user.id, keyName]
      );
      await query(
        `INSERT INTO api_keys (user_id, name, key_prefix, key_hash, scopes, human_client)
         VALUES ($1, $2, $3, $4, $5, true)`,
        [user.id, keyName, prefix, hash, PLUGIN_KEY_SCOPES]
      );
    });
  } else {
    const supabase = createServiceClient();
    await supabase
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("name", keyName)
      .is("revoked_at", null);

    const { error } = await supabase.from("api_keys").insert({
      user_id: user.id,
      name: keyName,
      key_prefix: prefix,
      key_hash: hash,
      scopes: PLUGIN_KEY_SCOPES,
      human_client: true,
    });
    if (error) throw new Error(error.message);
  }

  const url = new URL(redirectUri);
  url.searchParams.set("apiKey", fullKey);
  url.searchParams.set("email", user.email ?? "");
  url.searchParams.set("state", state);

  redirect(url.toString());
}
