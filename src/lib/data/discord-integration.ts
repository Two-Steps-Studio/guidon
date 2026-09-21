import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { createClient } from "@/lib/supabase-server";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secret-box";
import { generateApiKey, hashApiKey, keyPrefix, type ApiKeyScope } from "@/lib/api/api-keys";
import { PROJECT_LIST_SAFETY_CAP } from "@/lib/limits";

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

export type LinkDiscordGuildResult = { ok: true } | { ok: false; error: string };

export const DISCORD_GUILD_LINKED_ELSEWHERE_ERROR =
  "This server is linked to a project you don't manage; ask an admin of that project to disconnect it first";

/** Thrown inside a link transaction so it rolls back; never escapes this module. */
class LinkFailure extends Error {}

/**
 * The only unique constraint on discord_integrations besides the primary key
 * (which the upsert's ON CONFLICT already handles) is guild_id, so a 23505
 * here means "this guild is still linked to another project".
 */
function isGuildUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code, constraint } = error as { code?: unknown; constraint?: unknown };
  if (code !== "23505") return false;
  return typeof constraint !== "string" || constraint.includes("guild_id");
}

/**
 * Links a Discord server to a project (the web half of `/guidon-link`, see
 * src/app/discord/link): mints a fresh API key scoped exactly for what
 * discord-bot/'s /task commands need, encrypts it under the SAME info string
 * discord-bot/'s own direct-DB reads use (DISCORD_BOT_KEY_INFO), and stores
 * the link. The key is owned by `userId` (whoever confirmed the link), same as
 * any key they'd have created themselves from Profile - revoking it there
 * breaks the bot's access to this project.
 *
 * `guild_id` is UNIQUE, so if this server is currently linked to a DIFFERENT
 * project, that row's guild fields are cleared first (its webhook is kept),
 * then the chosen project's row is upserted. RLS only lets owner/admin of the
 * OLD project update its row, so for anyone else the clear silently affects 0
 * rows (or the row is invisible altogether) and the upsert then trips the
 * UNIQUE constraint - reported as DISCORD_GUILD_LINKED_ELSEWHERE_ERROR rather
 * than a raw constraint error. Self-hosted, everything (clear, upsert, key)
 * runs in one transaction, so a failure leaves nothing behind; the key insert
 * is deliberately last there. The caller is expected to have already checked
 * that `userId` can manage `projectId`; RLS re-enforces it.
 */
export async function linkDiscordGuildToProject(
  projectId: string,
  userId: string,
  guildId: string,
  guildName: string | null
): Promise<LinkDiscordGuildResult> {
  const rawKey = generateApiKey();
  const hash = hashApiKey(rawKey);
  const prefix = keyPrefix(rawKey);
  const encryptedKey = encryptSecret(rawKey, DISCORD_BOT_KEY_INFO);
  const keyName = `Discord bot (auto-created ${new Date().toISOString().slice(0, 10)})`;

  if (hasDirectDatabase()) {
    try {
      await withUser(userId, async ({ query }) => {
        // Sequential on purpose: one client, one query at a time.
        await query(
          `UPDATE discord_integrations
              SET guild_id = NULL, guild_name = NULL, linked_api_key_encrypted = NULL, linked_by = NULL,
                  updated_at = now()
            WHERE guild_id = $1 AND project_id <> $2`,
          [guildId, projectId]
        );
        const link = await query(
          // The DO UPDATE branch uses the bind parameters again instead of
          // EXCLUDED.<col>: EXCLUDED reads count as SELECT on the column, and
          // linked_api_key_encrypted has no SELECT grant for `authenticated`
          // (035), so the EXCLUDED form fails with "permission denied".
          `INSERT INTO discord_integrations (project_id, guild_id, guild_name, linked_api_key_encrypted, linked_by, updated_at)
           VALUES ($1, $2, $3, $4, $5, now())
           ON CONFLICT (project_id) DO UPDATE SET
             guild_id = $2,
             guild_name = $3,
             linked_api_key_encrypted = $4,
             linked_by = $5,
             updated_at = now()
           RETURNING project_id`,
          [projectId, guildId, guildName, encryptedKey, userId]
        );
        if (link.rows.length !== 1) throw new LinkFailure("Could not link the Discord server to this project.");

        const key = await query(
          `INSERT INTO api_keys (user_id, name, key_prefix, key_hash, scopes, bot_label)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [userId, keyName, prefix, hash, DISCORD_BOT_KEY_SCOPES, "Discord bot"]
        );
        if (key.rows.length !== 1) throw new LinkFailure("Could not create the Discord bot's API key.");
      });
    } catch (error) {
      if (isGuildUniqueViolation(error)) return { ok: false, error: DISCORD_GUILD_LINKED_ELSEWHERE_ERROR };
      if (error instanceof LinkFailure) return { ok: false, error: error.message };
      throw error;
    }
    return { ok: true };
  }

  // Supabase: no multi-statement transaction through PostgREST, so calls are
  // sequential and the key is created first and revoked again if the link
  // itself fails (never leave an active key that nothing uses).
  const supabase = await createClient();

  const { data: keyRow, error: keyError } = await supabase
    .from("api_keys")
    .insert({
      user_id: userId,
      name: keyName,
      key_prefix: prefix,
      key_hash: hash,
      scopes: DISCORD_BOT_KEY_SCOPES,
      bot_label: "Discord bot",
    })
    .select("id")
    .single();
  if (keyError || !keyRow) {
    throw new Error(`Failed to create the Discord bot's API key: ${keyError?.message ?? "no row returned"}`);
  }

  const revokeKey = async () => {
    await supabase.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", keyRow.id);
  };

  const { error: clearError } = await supabase
    .from("discord_integrations")
    .update({
      guild_id: null,
      guild_name: null,
      linked_api_key_encrypted: null,
      linked_by: null,
      updated_at: new Date().toISOString(),
    })
    .eq("guild_id", guildId)
    .neq("project_id", projectId)
    .select("project_id");
  if (clearError) {
    await revokeKey();
    throw new Error(`Failed to unlink the Discord server from its previous project: ${clearError.message}`);
  }

  // Update-then-insert rather than .upsert(): PostgREST's upsert emits
  // `DO UPDATE SET col = EXCLUDED.col`, and reading EXCLUDED.linked_api_key_encrypted
  // needs a SELECT grant that `authenticated` doesn't have on that column (035).
  const linkFields = {
    guild_id: guildId,
    guild_name: guildName,
    linked_api_key_encrypted: encryptedKey,
    linked_by: userId,
    updated_at: new Date().toISOString(),
  };
  let linkError: { code?: string; message: string } | null = null;
  let linkedRows = 0;
  {
    const updated = await supabase
      .from("discord_integrations")
      .update(linkFields)
      .eq("project_id", projectId)
      .select("project_id");
    linkError = updated.error;
    linkedRows = updated.data?.length ?? 0;
    if (!linkError && linkedRows === 0) {
      const inserted = await supabase
        .from("discord_integrations")
        .insert({ project_id: projectId, ...linkFields })
        .select("project_id");
      linkError = inserted.error;
      linkedRows = inserted.data?.length ?? 0;
    }
  }
  if (linkError || linkedRows !== 1) {
    await revokeKey();
    if (linkError && isGuildUniqueViolation(linkError)) {
      return { ok: false, error: DISCORD_GUILD_LINKED_ELSEWHERE_ERROR };
    }
    if (linkError) throw new Error(`Failed to link Discord server: ${linkError.message}`);
    return { ok: false, error: "Could not link the Discord server to this project." };
  }

  return { ok: true };
}

export interface ManageableProject {
  id: string;
  name: string;
  organizationId: string;
  organizationName: string;
  /**
   * Set when the project is already linked to some Discord server: that
   * server's name, or its id if it was linked before names were stored. Null
   * means not linked.
   */
  linkedGuildName: string | null;
}

/**
 * Projects where `userId` is owner/admin - the ones they may link a Discord
 * server to - in grouping-friendly order (organization name, then project
 * name). organizations is only visible to org members, so a project admin who
 * isn't one gets an empty organizationName instead of the project silently
 * vanishing from the list. Reads only the safe discord_integrations columns (the encrypted ones
 * have no direct SELECT grant, see 035).
 */
export async function listManageableProjectsForUser(userId: string): Promise<ManageableProject[]> {
  if (hasDirectDatabase()) {
    const result = await withUser(userId, ({ query }) =>
      query(
        `SELECT p.id, p.name, p.organization_id, COALESCE(o.name, '') AS organization_name,
                CASE WHEN di.guild_id IS NULL THEN NULL ELSE COALESCE(di.guild_name, di.guild_id) END AS linked_guild_name
           FROM project_members pm
           JOIN projects p ON p.id = pm.project_id
           LEFT JOIN organizations o ON o.id = p.organization_id
           LEFT JOIN discord_integrations di ON di.project_id = p.id
          WHERE pm.user_id = $1 AND pm.role IN ('owner', 'admin')
          ORDER BY o.name, p.name
          LIMIT $2`,
        [userId, PROJECT_LIST_SAFETY_CAP]
      )
    );
    return result.rows.map((row) => ({
      id: row.id as string,
      name: row.name as string,
      organizationId: row.organization_id as string,
      organizationName: row.organization_name as string,
      linkedGuildName: (row.linked_guild_name as string | null) ?? null,
    }));
  }

  type Embedded<T> = T | T[] | null;
  interface MemberRow {
    projects: Embedded<{
      id: string;
      name: string;
      organization_id: string;
      organizations: Embedded<{ id: string; name: string }>;
      discord_integrations: Embedded<{ guild_id: string | null; guild_name: string | null }>;
    }>;
  }
  const one = <T,>(value: Embedded<T>): T | null => (Array.isArray(value) ? (value[0] ?? null) : value);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_members")
    .select(
      "projects!inner(id, name, organization_id, organizations(id, name), discord_integrations(guild_id, guild_name))"
    )
    .eq("user_id", userId)
    .in("role", ["owner", "admin"])
    .limit(PROJECT_LIST_SAFETY_CAP);
  if (error) throw new Error(`Failed to list projects: ${error.message}`);

  const projects: ManageableProject[] = [];
  for (const row of (data ?? []) as unknown as MemberRow[]) {
    const project = one(row.projects);
    const organization = project ? one(project.organizations) : null;
    if (!project) continue;
    if (!project || !organization) continue;
    const integration = one(project.discord_integrations);
    projects.push({
      id: project.id,
      name: project.name,
      organizationId: project.organization_id,
      organizationName: organization?.name ?? "",
      linkedGuildName: integration?.guild_id ? (integration.guild_name ?? integration.guild_id) : null,
    });
  }
  projects.sort((a, b) => a.organizationName.localeCompare(b.organizationName) || a.name.localeCompare(b.name));
  return projects;
}
