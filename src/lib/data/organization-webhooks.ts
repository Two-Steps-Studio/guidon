import "server-only";

import { hasDirectDatabase } from "@/lib/db/pool";
import { withServiceRole, withUser } from "@/lib/db/session";
import { createClient, createServiceClient } from "@/lib/supabase-server";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secret-box";
import type { WebhookEventType } from "@/lib/webhooks/events";
import { generateWebhookSecret } from "@/lib/webhooks/security";

const WEBHOOK_SECRET_KEY_INFO = "org-webhook-secret-v1";

export const MAX_WEBHOOKS_PER_ORGANIZATION = 10;

/** Everything except the secret - safe to pass to a client component. */
export interface OrganizationWebhook {
  id: string;
  url: string;
  description: string | null;
  events: WebhookEventType[];
  enabled: boolean;
  last_delivery_at: string | null;
  last_status: number | null;
  last_error: string | null;
  created_at: string;
}

/** Matches the column-scoped GRANT SELECT in 050 - secret_encrypted is not readable as a user. */
const SAFE_COLUMNS = "id, url, description, events, enabled, last_delivery_at, last_status, last_error, created_at";

/** RLS (050) shows these only to the organization's owners/admins; anyone else gets an empty list. */
export async function listOrganizationWebhooks(organizationId: string, userId: string): Promise<OrganizationWebhook[]> {
  if (hasDirectDatabase()) {
    const result = await withUser(userId, ({ query }) =>
      query(`SELECT ${SAFE_COLUMNS} FROM organization_webhooks WHERE organization_id = $1 ORDER BY created_at`, [
        organizationId,
      ])
    );
    return result.rows as OrganizationWebhook[];
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_webhooks")
    .select(SAFE_COLUMNS)
    .eq("organization_id", organizationId)
    .order("created_at");
  if (error) throw new Error(`Failed to load webhooks: ${error.message}`);
  return (data ?? []) as OrganizationWebhook[];
}

/** Returns the plaintext signing secret - the only time it ever leaves the server. */
export async function createOrganizationWebhook(input: {
  organizationId: string;
  userId: string;
  url: string;
  description: string | null;
  events: WebhookEventType[];
}): Promise<{ id: string; secret: string }> {
  const secret = generateWebhookSecret();
  const secretEncrypted = encryptSecret(secret, WEBHOOK_SECRET_KEY_INFO);

  if (hasDirectDatabase()) {
    const result = await withUser(input.userId, ({ query }) =>
      query(
        `INSERT INTO organization_webhooks (organization_id, url, description, events, secret_encrypted, created_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [input.organizationId, input.url, input.description, input.events, secretEncrypted, input.userId]
      )
    );
    return { id: result.rows[0].id as string, secret };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_webhooks")
    .insert({
      organization_id: input.organizationId,
      url: input.url,
      description: input.description,
      events: input.events,
      secret_encrypted: secretEncrypted,
      created_by: input.userId,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Failed to save webhook: ${error.message}`);
  return { id: data.id as string, secret };
}

/** False when no row matched - wrong organization, or RLS refused it. */
export async function setOrganizationWebhookEnabled(
  organizationId: string,
  userId: string,
  webhookId: string,
  enabled: boolean
): Promise<boolean> {
  if (hasDirectDatabase()) {
    const result = await withUser(userId, ({ query }) =>
      query("UPDATE organization_webhooks SET enabled = $1 WHERE id = $2 AND organization_id = $3 RETURNING id", [
        enabled,
        webhookId,
        organizationId,
      ])
    );
    return result.rows.length > 0;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_webhooks")
    .update({ enabled })
    .eq("id", webhookId)
    .eq("organization_id", organizationId)
    .select("id");
  if (error) throw new Error(`Failed to update webhook: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

/** False when no row matched - wrong organization, or RLS refused it. */
export async function deleteOrganizationWebhook(organizationId: string, userId: string, webhookId: string): Promise<boolean> {
  if (hasDirectDatabase()) {
    const result = await withUser(userId, ({ query }) =>
      query("DELETE FROM organization_webhooks WHERE id = $1 AND organization_id = $2 RETURNING id", [
        webhookId,
        organizationId,
      ])
    );
    return result.rows.length > 0;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_webhooks")
    .delete()
    .eq("id", webhookId)
    .eq("organization_id", organizationId)
    .select("id");
  if (error) throw new Error(`Failed to delete webhook: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

export interface WebhookTarget {
  id: string;
  url: string;
  events: WebhookEventType[];
  secret: string;
}

interface TargetRow {
  id: string;
  url: string;
  events: WebhookEventType[];
  secret_encrypted: string;
}

function toTarget(row: TargetRow): WebhookTarget {
  return { id: row.id, url: row.url, events: row.events, secret: decryptSecret(row.secret_encrypted, WEBHOOK_SECRET_KEY_INFO) };
}

/**
 * Service role: an event is triggered by any project member with write
 * access, who can't see these rows under RLS - only owners/admins can. The
 * caller has already been authorized for the task mutation that produced
 * the event; this only reads where to send it.
 */
export async function getWebhookTargetsForProject(
  projectId: string
): Promise<{ organizationId: string; projectName: string; targets: WebhookTarget[] } | null> {
  if (hasDirectDatabase()) {
    return withServiceRole(async ({ query }) => {
      const project = await query("SELECT organization_id, name FROM projects WHERE id = $1", [projectId]);
      const row = project.rows[0];
      if (!row) return null;
      const hooks = await query(
        "SELECT id, url, events, secret_encrypted FROM organization_webhooks WHERE organization_id = $1 AND enabled",
        [row.organization_id]
      );
      return {
        organizationId: row.organization_id as string,
        projectName: row.name as string,
        targets: (hooks.rows as TargetRow[]).map(toTarget),
      };
    });
  }

  const supabase = createServiceClient();
  const { data: project } = await supabase.from("projects").select("organization_id, name").eq("id", projectId).maybeSingle();
  if (!project) return null;
  const { data: hooks, error } = await supabase
    .from("organization_webhooks")
    .select("id, url, events, secret_encrypted")
    .eq("organization_id", project.organization_id)
    .eq("enabled", true);
  if (error) throw new Error(`Failed to load webhooks: ${error.message}`);
  return {
    organizationId: project.organization_id as string,
    projectName: project.name as string,
    targets: ((hooks ?? []) as TargetRow[]).map(toTarget),
  };
}

/** Service role, for "Send test" - the action has already confirmed the caller can see this webhook. */
export async function getWebhookTarget(organizationId: string, webhookId: string): Promise<WebhookTarget | null> {
  if (hasDirectDatabase()) {
    const result = await withServiceRole(({ query }) =>
      query("SELECT id, url, events, secret_encrypted FROM organization_webhooks WHERE id = $1 AND organization_id = $2", [
        webhookId,
        organizationId,
      ])
    );
    const row = result.rows[0] as TargetRow | undefined;
    return row ? toTarget(row) : null;
  }

  const { data } = await createServiceClient()
    .from("organization_webhooks")
    .select("id, url, events, secret_encrypted")
    .eq("id", webhookId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  return data ? toTarget(data as TargetRow) : null;
}

export async function recordWebhookDelivery(
  webhookId: string,
  outcome: { status: number | null; error: string | null }
): Promise<void> {
  const values = {
    last_delivery_at: new Date().toISOString(),
    last_status: outcome.status,
    last_error: outcome.error ? outcome.error.slice(0, 300) : null,
  };

  if (hasDirectDatabase()) {
    await withServiceRole(({ query }) =>
      query("UPDATE organization_webhooks SET last_delivery_at = $1, last_status = $2, last_error = $3 WHERE id = $4", [
        values.last_delivery_at,
        values.last_status,
        values.last_error,
        webhookId,
      ])
    );
    return;
  }

  await createServiceClient().from("organization_webhooks").update(values).eq("id", webhookId);
}
