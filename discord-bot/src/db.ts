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
 * Links a guild to a project, or updates the link if this guild (or this
 * project) was already linked to something else. `guild_id` and
 * `project_id` are each UNIQUE/PRIMARY KEY (035_discord_integration.sql) -
 * relinking the same guild to a different project, or the same project to a
 * different guild, is a legitimate "someone re-ran /guidon link" case, not
 * an error; the one case that IS an error is trying to link a guild that's
 * already linked to a *different* project someone else set up, which would
 * otherwise silently steal that project's command access.
 */
export async function linkGuildToProject(
  guildId: string,
  guildName: string | null,
  projectId: string,
  apiKey: string
): Promise<LinkGuildResult> {
  const encryptedKey = encryptSecret(apiKey, config.authSecret, API_KEY_INFO);

  const existingForGuild = await getLinkByGuild(guildId);
  if (existingForGuild && existingForGuild.projectId !== projectId) {
    return {
      ok: false,
      error: "This Discord server is already linked to a different Guidon project. Ask an admin to unlink it first from that project's Settings page.",
    };
  }

  if (hasDirectDatabase()) {
    // linked_by isn't a real profiles.id here (the bot has no session for
    // the Discord user) - NULL rather than a fabricated value; the web
    // settings page's own linked_by (set when *it* writes the webhook
    // field) is unaffected, this only ever updates the bot's own columns.
    await pool().query(
      `INSERT INTO discord_integrations (project_id, guild_id, guild_name, linked_api_key_encrypted, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (project_id) DO UPDATE SET
         guild_id = EXCLUDED.guild_id,
         guild_name = EXCLUDED.guild_name,
         linked_api_key_encrypted = EXCLUDED.linked_api_key_encrypted,
         updated_at = now()`,
      [projectId, guildId, guildName, encryptedKey]
    );
    return { ok: true };
  }

  const { error } = await serviceClient()
    .from("discord_integrations")
    .upsert(
      { project_id: projectId, guild_id: guildId, guild_name: guildName, linked_api_key_encrypted: encryptedKey, updated_at: new Date().toISOString() },
      { onConflict: "project_id" }
    );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

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
