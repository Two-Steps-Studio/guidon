import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { createClient } from "@/lib/supabase-server";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secret-box";
import { generateApiKey, hashApiKey, keyPrefix, type ApiKeyScope } from "@/lib/api/api-keys";

/**
 * Same key-derivation "info" string discord-bot/ uses in its own copy of
 * secret-box.ts for `linked_api_key_encrypted` - kept identical so a value
 * either side writes, the other can read. Webhook URLs use a different info
 * string since they're a different secret type under the same AUTH_SECRET
 * root (secret-box.ts's own doc comment: "different secret types ... never
 * share a key even though they share AUTH_SECRET as the root").
 */
const DISCORD_WEBHOOK_KEY_INFO = "discord-webhook-v1";
/** Must match discord-bot/src/db.ts's own API_KEY_INFO constant exactly. */
const DISCORD_BOT_KEY_INFO = "discord-bot-key-v1";
/** Exactly what every /task subcommand needs - see discord-bot/src/commands/task.ts. */
const DISCORD_BOT_KEY_SCOPES: ApiKeyScope[] = ["tasks:read", "tasks:status", "comments:write"];

export interface DiscordIntegrationInfo {
  guildId: string | null;
  guildName: string | null;
  hasWebhook: boolean;
  linkedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

const SAFE_COLUMNS = "project_id, guild_id, guild_name, linked_by, created_at, updated_at";

/**
 * Safe subset for the project settings page - never includes the webhook
 * URL or the bot's linked API key. `hasWebhook` is derived from whether the
 * encrypted column is non-null, read through the same SECURITY DEFINER path
 * as the URL itself (get_discord_webhook_url) rather than a second direct
 * column grant - see 035_discord_integration.sql's own comment for why that
 * column has no direct SELECT grant at all.
 */
export async function getDiscordIntegrationInfo(
  projectId: string,
  userId: string
): Promise<DiscordIntegrationInfo | null> {
  if (hasDirectDatabase()) {
    const [safeResult, webhookResult] = await Promise.all([
      withUser(userId, ({ query }) =>
        query(`SELECT ${SAFE_COLUMNS} FROM discord_integrations WHERE project_id = $1`, [projectId])
      ),
      withUser(userId, ({ query }) =>
        query("SELECT webhook_url_encrypted FROM public.get_discord_webhook_url($1)", [projectId])
      ),
    ]);
    const row = safeResult.rows[0];
    if (!row) return null;
    return toInfo(row, webhookResult.rows[0]?.webhook_url_encrypted ?? null);
  }

  const supabase = await createClient();
  const [safeResult, webhookResult] = await Promise.all([
    supabase.from("discord_integrations").select(SAFE_COLUMNS).eq("project_id", projectId).maybeSingle(),
    supabase.rpc("get_discord_webhook_url", { p_project_id: projectId }),
  ]);
  if (safeResult.error || !safeResult.data) return null;
  if (webhookResult.error) throw new Error(`Failed to read Discord integration: ${webhookResult.error.message}`);

  return toInfo(safeResult.data, webhookResult.data?.[0]?.webhook_url_encrypted ?? null);
}

function toInfo(
  row: { project_id: string; guild_id: string | null; guild_name: string | null; linked_by: string | null; created_at: string; updated_at: string },
  webhookUrlEncrypted: string | null
): DiscordIntegrationInfo {
  return {
    guildId: row.guild_id,
    guildName: row.guild_name,
    hasWebhook: webhookUrlEncrypted !== null,
    linkedBy: row.linked_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Server-only: the decrypted URL, only ever used inside
 * src/lib/discord/notify.ts to actually POST a notification - never
 * returned to a client component.
 *
 * `client`, when passed, is used instead of building one from cookies -
 * required for callers that run outside a browser session (the /api/v1
 * status-transition path, task-transitions.ts) since createClient() has no
 * cookies to read there and silently resolves as the `anon` role, which
 * get_discord_webhook_url's SECURITY DEFINER grant (authenticated only)
 * then rejects with "permission denied" rather than an auth error - that
 * was exactly the bug this parameter fixes. A browser-triggered caller
 * (work/actions.ts) omits it and keeps using the cookie-based client.
 */
export async function getDiscordWebhookUrl(
  projectId: string,
  userId: string,
  client?: SupabaseClient
): Promise<string | null> {
  if (hasDirectDatabase()) {
    const result = await withUser(userId, ({ query }) =>
      query("SELECT webhook_url_encrypted FROM public.get_discord_webhook_url($1)", [projectId])
    );
    const encrypted = result.rows[0]?.webhook_url_encrypted as string | null | undefined;
    return encrypted ? decryptSecret(encrypted, DISCORD_WEBHOOK_KEY_INFO) : null;
  }

  const supabase = client ?? (await createClient());
  const { data, error } = await supabase.rpc("get_discord_webhook_url", { p_project_id: projectId });
  if (error) throw new Error(`Failed to read Discord webhook: ${error.message}`);
  const encrypted = data?.[0]?.webhook_url_encrypted as string | null | undefined;
  return encrypted ? decryptSecret(encrypted, DISCORD_WEBHOOK_KEY_INFO) : null;
}

/**
 * Sets (or replaces) the project's notification webhook - the only field
 * the web app itself ever writes to this table. `guild_id`/`guild_name`/
 * `linked_api_key_encrypted` are set exclusively by discord-bot/'s own
 * direct DB connection when someone runs `/guidon link` - see
 * 035_discord_integration.sql's comment block for the full split.
 */
export async function saveDiscordWebhookUrl(projectId: string, userId: string, webhookUrl: string): Promise<void> {
  const encrypted = encryptSecret(webhookUrl, DISCORD_WEBHOOK_KEY_INFO);

  if (hasDirectDatabase()) {
    await withUser(userId, ({ query }) =>
      query(
        `INSERT INTO discord_integrations (project_id, webhook_url_encrypted, linked_by, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (project_id) DO UPDATE SET
           webhook_url_encrypted = EXCLUDED.webhook_url_encrypted,
           updated_at = now()`,
        [projectId, encrypted, userId]
      )
    );
    return;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("discord_integrations").upsert(
    { project_id: projectId, webhook_url_encrypted: encrypted, linked_by: userId, updated_at: new Date().toISOString() },
    { onConflict: "project_id" }
  );
  if (error) throw new Error(`Failed to save Discord webhook: ${error.message}`);
}

/**
 * Clears the notification webhook. Leaves the row (and any bot link) in
 * place if one exists - this only ever un-sets the one field the web app
 * owns, same split as saveDiscordWebhookUrl above.
 */
export async function clearDiscordWebhookUrl(projectId: string, userId: string): Promise<void> {
  if (hasDirectDatabase()) {
    await withUser(userId, ({ query }) =>
      query(
        "UPDATE discord_integrations SET webhook_url_encrypted = NULL, updated_at = now() WHERE project_id = $1",
        [projectId]
      )
    );
    return;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("discord_integrations")
    .update({ webhook_url_encrypted: null, updated_at: new Date().toISOString() })
    .eq("project_id", projectId);
  if (error) throw new Error(`Failed to clear Discord webhook: ${error.message}`);
}

/**
 * Completes the "Connect to Discord" OAuth flow (src/app/api/discord/callback):
 * mints a fresh API key scoped exactly for what discord-bot/'s /task
 * commands need, encrypts it under the SAME info string discord-bot/'s own
 * direct-DB writes use (DISCORD_BOT_KEY_INFO), and links the guild - all in
 * one step, so nobody has to manually create an API key or type a project
 * id into a Discord command. The key is owned by `userId` (the person who
 * clicked Connect, not some system account), same as any key they'd have
 * created themselves from Profile - it shows up there, and revoking it from
 * that page breaks the bot's access to this project, same as it would for
 * any other integration built on a self-service key.
 */
export async function linkDiscordGuildViaOAuth(projectId: string, userId: string, guildId: string): Promise<void> {
  const rawKey = generateApiKey();
  const hash = hashApiKey(rawKey);
  const prefix = keyPrefix(rawKey);
  const encryptedKey = encryptSecret(rawKey, DISCORD_BOT_KEY_INFO);
  const keyName = `Discord bot (auto-created ${new Date().toISOString().slice(0, 10)})`;

  if (hasDirectDatabase()) {
    await withUser(userId, async ({ query }) => {
      await query(
        `INSERT INTO api_keys (user_id, name, key_prefix, key_hash, scopes, bot_label)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, keyName, prefix, hash, DISCORD_BOT_KEY_SCOPES, "Discord bot"]
      );
      await query(
        `INSERT INTO discord_integrations (project_id, guild_id, linked_api_key_encrypted, linked_by, updated_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (project_id) DO UPDATE SET
           guild_id = EXCLUDED.guild_id,
           linked_api_key_encrypted = EXCLUDED.linked_api_key_encrypted,
           linked_by = EXCLUDED.linked_by,
           updated_at = now()`,
        [projectId, guildId, encryptedKey, userId]
      );
    });
    return;
  }

  const supabase = await createClient();

  const { error: keyError } = await supabase.from("api_keys").insert({
    user_id: userId,
    name: keyName,
    key_prefix: prefix,
    key_hash: hash,
    scopes: DISCORD_BOT_KEY_SCOPES,
    bot_label: "Discord bot",
  });
  if (keyError) throw new Error(`Failed to create the Discord bot's API key: ${keyError.message}`);

  const { error } = await supabase.from("discord_integrations").upsert(
    {
      project_id: projectId,
      guild_id: guildId,
      linked_api_key_encrypted: encryptedKey,
      linked_by: userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "project_id" }
  );
  if (error) throw new Error(`Failed to link Discord server: ${error.message}`);
}
