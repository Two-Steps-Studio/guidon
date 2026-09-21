import { Pool } from "pg";
import { createClient } from "@supabase/supabase-js";
import { config, hasDirectDatabase } from "./config.js";
import { decryptSecret, encryptSecret } from "./crypto.js";

const API_KEY_INFO = "discord-bot-key-v1";
// Must match src/lib/data/discord-integration.ts's DISCORD_WEBHOOK_KEY_INFO
// exactly - both sides encrypt/decrypt the same webhook_url_encrypted
// column under this info string.
const WEBHOOK_KEY_INFO = "discord-webhook-v1";

// Lazy singletons - only the branch this deployment actually uses ever gets
// constructed, same reasoning as the main app's src/lib/db/pool.ts.
let pgPool: Pool | null = null;
function pool(): Pool {
  if (!pgPool) pgPool = new Pool({ connectionString: config.databaseUrl! });
  return pgPool;
}

// No generated Database types for this standalone package (it only ever
// touches one table, discord_integrations) - `any` here is what keeps
// supabase-js's query builder from collapsing insert/update payload types
// to `never` without a schema generic, same tradeoff the main app avoids
// only because it doesn't type its Supabase client from generated types
// either (grep hasDirectDatabase() call sites - every .from() there is
// against an untyped client too).
let supabase: ReturnType<typeof createClient<any, any, any>> | null = null;
function serviceClient() {
  if (!supabase) supabase = createClient<any, any, any>(config.supabaseUrl!, config.supabaseServiceRoleKey!);
  return supabase;
}

export interface GuildLink {
  projectId: string;
  guildId: string;
  guildName: string | null;
  apiKey: string;
}

/** Resolves which Guidon project (and API key to call it with) a Discord guild is linked to, if any. */
export async function getLinkByGuild(guildId: string): Promise<GuildLink | null> {
  if (hasDirectDatabase()) {
    const { rows } = await pool().query(
      "SELECT project_id, guild_id, guild_name, linked_api_key_encrypted FROM discord_integrations WHERE guild_id = $1",
      [guildId]
    );
    const row = rows[0];
    if (!row?.linked_api_key_encrypted) return null;
    return toLink(row.project_id, row.guild_id, row.guild_name, row.linked_api_key_encrypted);
  }

  const { data, error } = await serviceClient()
    .from("discord_integrations")
    .select("project_id, guild_id, guild_name, linked_api_key_encrypted")
    .eq("guild_id", guildId)
    .maybeSingle();
  if (error) throw new Error(`Failed to read Discord link: ${error.message}`);
  if (!data?.linked_api_key_encrypted) return null;
  return toLink(data.project_id, data.guild_id, data.guild_name, data.linked_api_key_encrypted);
}

function toLink(projectId: string, guildId: string, guildName: string | null, apiKeyEncrypted: string): GuildLink {
  return {
    projectId,
    guildId,
    guildName,
    apiKey: decryptSecret(apiKeyEncrypted, config.authSecret, API_KEY_INFO),
  };
}

export type LinkGuildResult = { ok: true } | { ok: false; error: string };

/**
 * Sets the notification webhook for the guild's linked project - an
 * alternative to the web app's own Settings-page form (discord-actions.ts)
 * for an admin who manages everything from Discord and never opens the web
 * app. Requires the guild to already be linked (via /guidon-link) so there's
 * a project_id row to attach the webhook to.
 */
export async function saveWebhookForGuild(guildId: string, webhookUrl: string): Promise<LinkGuildResult> {
  const link = await getLinkByGuild(guildId);
  if (!link) {
    return { ok: false, error: "This server isn't linked to a Guidon project yet - run /guidon-link first." };
  }

  const encrypted = encryptSecret(webhookUrl, config.authSecret, WEBHOOK_KEY_INFO);

  if (hasDirectDatabase()) {
    await pool().query(
      "UPDATE discord_integrations SET webhook_url_encrypted = $1, updated_at = now() WHERE project_id = $2",
      [encrypted, link.projectId]
    );
    return { ok: true };
  }

  const { error } = await serviceClient()
    .from("discord_integrations")
    .update({ webhook_url_encrypted: encrypted, updated_at: new Date().toISOString() })
    .eq("project_id", link.projectId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
